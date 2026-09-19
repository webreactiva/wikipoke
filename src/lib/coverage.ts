// Coverage: "is all the code in the wiki?", the mirror of drift.
//
// Tracked code that no page's `sources:` claims, filtered by wiki/.wikipokeignore. It is debt, not
// breakage: resolve each cluster by adding a page (usually a module page) or, when the code is
// genuinely out of scope, by ignoring it in .wikipokeignore, a conscious call rather than silence.
import type { CheckContext, ReportOptions } from "./lib.ts";
import { IGNORE_FILE, color, ignoredFiles, indexableFiles, listPages, matchesAny, readPage, sourcePatterns } from "./lib.ts";

/** Uncovered files grouped by the folder they sit in, so a gap reads as one place to go. */
export interface Cluster {
  dir: string;
  count: number;
}

export interface CoverageResult {
  unclaimed: string[];
  clusters: Cluster[];
  ignored: string[];
  indexable: number;
  pages: number;
}

export function run({ root, wikiDir }: CheckContext): CoverageResult {
  const pages = listPages(wikiDir).map(readPage);
  const patterns = pages.flatMap((p) => sourcePatterns(p.meta, root));
  const indexable = indexableFiles(root, wikiDir);
  const unclaimed = patterns.length ? indexable.filter((f) => !matchesAny(f, patterns)) : indexable;

  const byDir = new Map<string, number>();
  for (const f of unclaimed) {
    const parts = f.split("/");
    const dir = parts.length > 3 ? parts.slice(0, 3).join("/") : parts.slice(0, -1).join("/") || ".";
    byDir.set(dir, (byDir.get(dir) ?? 0) + 1);
  }
  const clusters = [...byDir.entries()]
    .map(([dir, count]) => ({ dir, count }))
    .sort((a, b) => b.count - a.count || a.dir.localeCompare(b.dir));

  // What the ignore list hides, so a rule that hides too much is visible instead of silent.
  const ignored = ignoredFiles(root, wikiDir);

  return { unclaimed, clusters, ignored, indexable: indexable.length, pages: pages.length };
}

/** Human report. Silent when coverage is complete: the hooks depend on it. */
export function report(res: CoverageResult, { verbose }: ReportOptions = {}): number {
  if (!res.unclaimed.length) return 0;
  console.log(
    `${color.yellow("uncovered")} ${res.unclaimed.length} of ${res.indexable} tracked code file(s) ` +
      `claimed by no page ${color.dim("-> wikipoke-ingest <path>")}`,
  );
  for (const { dir, count } of res.clusters) console.log(`    ${String(count).padStart(5)}  ${color.dim(dir === "." ? "(root)" : dir)}`);
  if (verbose) {
    console.log(color.dim("    --"));
    for (const f of res.unclaimed) console.log(`    ${color.dim(f)}`);
  }
  // Not a finding: a number, so nobody has to infer what the ignore list took out of the total. It
  // stays the last line, and each ignored path says so, because `-v | tail` is how the list gets read.
  if (res.ignored.length) {
    if (verbose) for (const f of res.ignored) console.log(`    ${color.dim(`ignored  ${f}`)}`);
    console.log(color.dim(`    ${res.ignored.length} more file(s) ignored by ${IGNORE_FILE}`));
  }
  return res.unclaimed.length;
}
