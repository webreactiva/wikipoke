// Coverage: "is all the code in the wiki?", the mirror of drift.
//
// Tracked code that no page's `sources:` claims, filtered by wiki/.wikipokeignore. It is debt, not
// breakage: resolve each cluster by adding a page (usually a module page) or, when the code is
// genuinely out of scope, by ignoring it in .wikipokeignore, a conscious call rather than silence.
import { color, indexableFiles, listPages, matchesAny, readPage, sourcePatterns } from "./lib.mjs";

export function run({ root, wikiDir }) {
  const pages = listPages(wikiDir).map(readPage);
  const patterns = pages.flatMap((p) => sourcePatterns(p.meta, root));
  const indexable = indexableFiles(root, wikiDir);
  const unclaimed = patterns.length ? indexable.filter((f) => !matchesAny(f, patterns)) : indexable;

  const byDir = new Map();
  for (const f of unclaimed) {
    const parts = f.split("/");
    const dir = parts.length > 3 ? parts.slice(0, 3).join("/") : parts.slice(0, -1).join("/") || ".";
    byDir.set(dir, (byDir.get(dir) ?? 0) + 1);
  }
  const clusters = [...byDir.entries()]
    .map(([dir, count]) => ({ dir, count }))
    .sort((a, b) => b.count - a.count || a.dir.localeCompare(b.dir));

  return { unclaimed, clusters, indexable: indexable.length, pages: pages.length };
}

/** Human report. Silent when coverage is complete: the hooks depend on it. */
export function report(res, { verbose } = {}) {
  if (!res.unclaimed.length) return 0;
  console.log(
    `${color.yellow("uncovered")} ${res.unclaimed.length} of ${res.indexable} tracked code file(s) ` +
      `claimed by no page ${color.dim("-> wikipoke-ingest <path>")}`,
  );
  for (const { dir, count } of res.clusters) console.log(`    ${String(count).padStart(5)}  ${color.dim(dir)}`);
  if (verbose) {
    console.log(color.dim("    --"));
    for (const f of res.unclaimed) console.log(`    ${color.dim(f)}`);
  }
  return res.unclaimed.length;
}
