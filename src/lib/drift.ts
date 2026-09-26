// Staleness: "has the code moved past the wiki?", on both axes at once.
//
//   repo axis : commits since the checkpoint's last_indexed_commit (minus .wikipokeignore)
//   page axis : per page, has any of its `sources:` changed since its own `synced:`
//
// The two answer different questions and neither replaces the other: the repo axis catches code
// nobody has looked at yet, the page axis catches pages that lie. It counts; it does not judge.
//
// Citations get a third look, finer than either: each one is carried through the diff from the
// commit that wrote it, so a page that was re-stamped without its pointers being moved still says
// where they went.
import { relative } from "node:path";

import type { CheckContext, LoadedPage, ReportOptions } from "./lib.ts";
import {
  asList,
  changedSince,
  color,
  commitExists,
  KEY_SHAPE,
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
  sourcesKey,
  workingFiles,
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
 * A citation whose line the code moved since it was written. `now` is where that line sits in the
 * working tree, or null when the line itself was edited or deleted and only re-reading can say.
 */
export interface MovedCitation {
  raw: string;
  now: number | null;
}

/**
 * How a page was judged. `synced` is the commit comparison; `sources_key` is the content
 * comparison that takes over when that commit is gone, and it knows *that* the sources moved, never
 * which of them did.
 */
export type JudgedBy = "synced" | "sources_key";

/** A page whose own `sources:` moved past its own `synced:`. */
export interface StalePage {
  id: string;
  synced: string;
  by: JudgedBy;
  files: string[];
  citations: MovedCitation[];
}

/**
 * A page whose sources did not move but whose citations did: re-stamped without being re-pointed,
 * or citing a file outside its own `sources:`.
 */
export interface MovedPage {
  id: string;
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
  moved: MovedPage[];
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
  // Two `git ls-files` for the whole run, and only in a wiki that has a page to judge by content.
  let files: string[] | undefined;
  const working = (): string[] => (files ??= workingFiles(root));

  const stale: StalePage[] = [];
  const moved: MovedPage[] = [];
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
    // A squash or rebase merge rewrites the commits a wiki pass stamped, so `synced` can name a
    // commit nobody has any more. The page is not broken and drift is not blind: its content key
    // answers the same question without git history. Citations cannot be carried without a diff,
    // so they are left to lint, which re-reads every one of them against the file as it is.
    if (!commitExists(root, synced)) {
      const stored = meta.sources_key;
      // Only a key of the right shape answers. A typo would never match anything, so trusting it
      // would pin the page to "stale" for good, however often someone re-read it — the one failure
      // this whole mechanism exists to avoid. Lint names the typo; here it is simply no answer.
      if (typeof stored !== "string" || !KEY_SHAPE.test(stored)) {
        skipped.push({ id: page.id, reason: `unknown sha: ${synced}${stored ? `, and \`sources_key: ${stored}\` is not a content key` : ""}` });
        continue;
      }
      const now = sourcesKey(root, meta, working());
      // git could not hash the page's files (an unreadable one, a submodule): that is not evidence
      // the code moved, so it must not be reported as if it were.
      if (now === null) skipped.push({ id: page.id, reason: `unknown sha: ${synced}, and its sources could not be hashed` });
      else if (now !== stored) stale.push({ id: page.id, synced, by: "sources_key", files: [], citations: [] });
      else fresh.push(page.id);
      continue;
    }
    const patterns = sourcePatterns(meta, root);
    const files = changesFor(synced).filter((f) => matchesAny(f, patterns));
    const citations = movedCitations(root, wikiDir, page, changesFor, hunksFor);
    if (files.length) stale.push({ id: page.id, synced, by: "synced", files, citations });
    else {
      fresh.push(page.id);
      if (citations.length) moved.push({ id: page.id, citations });
    }
  }

  return { repo, stale, moved, skipped, fresh, pages: pages.length };
}

/**
 * The page's citations the code moved since each was written, carried through the diff to the
 * working tree. Not from `synced:`: a citation written after it — into a file added since, or
 * re-pointed and not yet re-stamped — would be moved a second time, and one left behind by a
 * re-stamp would never be moved at all. So the start is the commit that last wrote the page line
 * the citation sits on, and a line not committed yet is taken as current.
 */
function movedCitations(
  root: string,
  wikiDir: string,
  page: LoadedPage,
  changesFor: (sha: string) => string[],
  hunksFor: (sha: string, path: string) => Hunk[],
): MovedCitation[] {
  const citations = pageCitations(page.body, page.rel, wikiDir, root);
  if (!citations.length) return [];
  const lines = page.raw.split("\n");
  const origins = blame(root, relative(root, page.path));
  const moved: MovedCitation[] = [];
  for (const cite of citations) {
    // ponytail: dates the line, not the number — an edit elsewhere on the line re-dates the
    // citation too. Per-citation history (`git log -L`) if that ever hides a real move.
    const origin = origins[lines.findIndex((line) => line.includes(cite.raw))];
    if (!origin || !changesFor(origin).includes(cite.path)) continue;
    const now = lineNow(hunksFor(origin, cite.path), cite.line);
    if (now !== cite.line) moved.push({ raw: cite.raw, now });
  }
  return moved;
}

/** The commit that last wrote each line of a file, or null for a line not committed yet. */
function blame(root: string, path: string): (string | null)[] {
  const out = gitOrNull(root, ["blame", "--porcelain", "--", path]) ?? "";
  const origins: (string | null)[] = [];
  for (const m of out.matchAll(/^([0-9a-f]{40}) \d+ (\d+)/gm))
    origins[Number(m[2]) - 1] = /^0+$/.test(m[1] as string) ? null : (m[1] as string);
  return origins;
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
    // Judged by content, there is no diff to name files from: say which sources to re-read, and why
    // the sha in the frontmatter is not the one to reach for.
    const how =
      item.by === "sources_key"
        ? `(its sources changed; ${item.synced} is not a commit here any more — re-read its sources:)`
        : `(since ${item.synced})`;
    console.log(`${color.yellow("stale")}     ${color.bold(item.id)} ${color.dim(how)}`);
    const shown = verbose ? item.files : item.files.slice(0, 8);
    for (const f of shown) console.log(`    ${color.dim(f)}`);
    if (!verbose && item.files.length > shown.length) console.log(color.dim(`    …and ${item.files.length - shown.length} more`));
    printCitations(item.citations, verbose);
  }

  for (const item of res.moved) {
    found++;
    console.log(`${color.yellow("moved")}     ${color.bold(item.id)} ${color.dim("(fresh, but the code moved under its citations)")}`);
    printCitations(item.citations, verbose);
  }

  for (const item of res.skipped) {
    found++;
    console.log(`${color.red("no-check")}  ${color.bold(item.id)} — ${item.reason}`);
  }

  return found;
}

/** Capped like the file list: the notifier puts this into an agent's prompt, and a refactor moves dozens. */
function printCitations(citations: MovedCitation[], verbose: boolean | undefined): void {
  const shown = verbose ? citations : citations.slice(0, 8);
  for (const { raw, now } of shown)
    console.log(`    ${color.dim(`${raw} ${now === null ? "— that line changed, re-read it" : `is now line ${now}`}`)}`);
  if (shown.length < citations.length)
    console.log(color.dim(`    …and ${citations.length - shown.length} more citation(s): wikipoke check drift --json`));
}
