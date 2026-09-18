// Staleness: "has the code moved past the wiki?", on both axes at once.
//
//   repo axis : commits since the checkpoint's last_indexed_commit (minus .wikipokeignore)
//   page axis : per page, has any of its `sources:` changed since its own `synced:`
//
// The two answer different questions and neither replaces the other: the repo axis catches code
// nobody has looked at yet, the page axis catches pages that lie. It counts; it does not judge.
//
// A stale page also gets its `path:line` citations carried through the diff, because re-stamping
// `synced:` is the last moment anyone can still see where a cited line went.
import type { CheckContext, Citation, ReportOptions } from "./lib.ts";
import {
  asList,
  changedSince,
  color,
  commitExists,
  commitsSince,
  gitOrNull,
  indexableChanges,
  listPages,
  matchesAny,
  pageCitations,
  readPage,
  readState,
  shortSha,
  sourcePatterns,
} from "./lib.ts";

/**
 * The repository axis. The four states are exclusive, and only the last two know a commit count:
 * without a usable checkpoint there is nothing to count from.
 */
export type RepoAxis =
  | { status: "no-checkpoint" }
  | { status: "unknown-checkpoint"; last: string }
  | { status: "current" | "behind"; last: string; commits: number; files: number };

/**
 * A citation on a stale page whose line the diff moved. `now` is where that line sits in the
 * working tree, or null when the line itself was edited or deleted and only re-reading can say.
 * It is mapped from the page's `synced:`, so it assumes the citation was written against that
 * commit: a page re-pointed but not re-stamped reads as moved again, and would move twice.
 */
export interface MovedCitation {
  raw: string;
  now: number | null;
}

/** A page whose own `sources:` moved past its own `synced:`. */
export interface StalePage {
  id: string;
  synced: string;
  files: string[];
  citations: MovedCitation[];
}

/** A page drift cannot judge, because its contract with the code is broken. */
export interface SkippedPage {
  id: string;
  reason: string;
}

export interface DriftResult {
  repo: RepoAxis;
  stale: StalePage[];
  skipped: SkippedPage[];
  fresh: string[];
  pages: number;
}

export function run({ root, wikiDir }: CheckContext): DriftResult {
  const repo = repoAxis(root, wikiDir);
  const pages = listPages(wikiDir).map(readPage);

  // One `git diff` per distinct sha, not one per page; one per sha and cited file for the lines.
  const cache = new Map<string, string[]>();
  const changesFor = (sha: string): string[] => {
    let changes = cache.get(sha);
    if (!changes) cache.set(sha, (changes = changedSince(root, sha)));
    return changes;
  };
  const hunkCache = new Map<string, Hunk[]>();
  const hunksFor = (sha: string, path: string): Hunk[] => {
    let hunks = hunkCache.get(`${sha}:${path}`);
    if (!hunks) hunkCache.set(`${sha}:${path}`, (hunks = diffHunks(root, sha, path)));
    return hunks;
  };

  const stale: StalePage[] = [];
  const skipped: SkippedPage[] = [];
  const fresh: string[] = [];

  for (const page of pages) {
    const meta = page.meta ?? {};
    const sources = asList(meta.sources);
    const synced = meta.synced;
    if (!sources.length || typeof synced !== "string" || !synced) {
      skipped.push({ id: page.id, reason: "no contract (missing sources or synced)" });
      continue;
    }
    if (!commitExists(root, synced)) {
      skipped.push({ id: page.id, reason: `unknown sha: ${synced}` });
      continue;
    }
    const patterns = sourcePatterns(meta, root);
    const files = changesFor(synced).filter((f) => matchesAny(f, patterns));
    if (!files.length) {
      fresh.push(page.id);
      continue;
    }
    const cites = pageCitations(page.body, page.rel, wikiDir, root);
    stale.push({ id: page.id, synced, files, citations: movedCitations(cites, changesFor(synced), (path) => hunksFor(synced, path)) });
  }

  return { repo, stale, skipped, fresh, pages: pages.length };
}

/**
 * The page's citations into the files that changed, carried from `synced` to the working tree.
 * Only the ones that no longer point at their line come back: a citation the diff did not touch
 * is not news. Any cited file that changed counts, not only the page's own `sources:`.
 */
function movedCitations(citations: Citation[], changes: string[], hunksFor: (path: string) => Hunk[]): MovedCitation[] {
  const changed = new Set(changes);
  const moved: MovedCitation[] = [];
  for (const cite of citations) {
    if (!changed.has(cite.path)) continue;
    const now = lineNow(hunksFor(cite.path), cite.line);
    if (now !== cite.line) moved.push({ raw: cite.raw, now });
  }
  return moved;
}

/** One `@@ -a,b +c,d @@` header: `b` old lines from `a` became `d` new ones. */
interface Hunk {
  oldStart: number;
  oldCount: number;
  newCount: number;
}

function diffHunks(root: string, sha: string, path: string): Hunk[] {
  const diff = gitOrNull(root, ["diff", "--no-color", "--no-ext-diff", "-U0", sha, "--", path]) ?? "";
  return [...diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,(\d+))? @@/gm)].map((m) => ({
    oldStart: Number(m[1]),
    oldCount: m[2] === undefined ? 1 : Number(m[2]),
    newCount: m[3] === undefined ? 1 : Number(m[3]),
  }));
}

/**
 * Where old line `line` sits after the hunks, or null when a hunk rewrote or removed it. A pure
 * insertion (`oldCount` 0) goes *after* its `oldStart`, so that line itself does not move.
 */
function lineNow(hunks: Hunk[], line: number): number | null {
  let shift = 0;
  for (const h of hunks) {
    if (h.oldCount === 0 ? line <= h.oldStart : line < h.oldStart) break;
    if (h.oldCount > 0 && line < h.oldStart + h.oldCount) return null;
    shift += h.newCount - h.oldCount;
  }
  return line + shift;
}

function repoAxis(root: string, wikiDir: string): RepoAxis {
  const last = readState(wikiDir)?.last_indexed_commit;
  if (!last) return { status: "no-checkpoint" };
  if (!commitExists(root, last)) return { status: "unknown-checkpoint", last };

  const commits = commitsSince(root, last);
  if (!commits) return { status: "current", last, commits: 0, files: 0 };

  const files = indexableChanges(root, wikiDir, `${last}..HEAD`).length;
  return { status: files ? "behind" : "current", last, commits, files };
}

/** Human report. Silent when everything is current: the hooks depend on it. */
export function report(res: DriftResult, { verbose }: ReportOptions = {}): number {
  let found = 0;

  if (res.repo.status === "behind") {
    found++;
    console.log(
      `${color.yellow("behind")}    repo — ${res.repo.commits} commit(s) not indexed ` +
        `(${res.repo.files} code file(s)) since ${shortSha(res.repo.last)} ` +
        color.dim("-> wikipoke-ingest"),
    );
  } else if (res.repo.status === "unknown-checkpoint") {
    found++;
    // In full: the usual cause is a hand-typed sha whose first seven characters are right.
    console.log(`${color.red("broken")}    repo — the checkpoint points at ${res.repo.last}, which is not a commit here`);
  } else if (res.repo.status === "no-checkpoint") {
    found++;
    console.log(`${color.red("broken")}    repo — no checkpoint yet ${color.dim("-> wikipoke-ingest")}`);
  }

  for (const item of res.stale) {
    found++;
    console.log(`${color.yellow("stale")}     ${color.bold(item.id)} ${color.dim(`(since ${item.synced})`)}`);
    const shown = verbose ? item.files : item.files.slice(0, 8);
    for (const f of shown) console.log(`    ${color.dim(f)}`);
    if (!verbose && item.files.length > shown.length) console.log(color.dim(`    …and ${item.files.length - shown.length} more`));
    for (const { raw, now } of item.citations)
      console.log(`    ${color.dim(`${raw} ${now === null ? "— that line changed, re-read it" : `is now line ${now}`}`)}`);
  }

  for (const item of res.skipped) {
    found++;
    console.log(`${color.red("no-check")}  ${color.bold(item.id)} — ${item.reason}`);
  }

  return found;
}
