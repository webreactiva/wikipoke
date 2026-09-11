// Staleness: "has the code moved past the wiki?", on both axes at once.
//
//   repo axis : commits since the checkpoint's last_indexed_commit (minus .wikipokeignore)
//   page axis : per page, has any of its `sources:` changed since its own `synced:`
//
// The two answer different questions and neither replaces the other: the repo axis catches code
// nobody has looked at yet, the page axis catches pages that lie. It counts; it does not judge.
import {
  changedSince,
  color,
  commitExists,
  commitsSince,
  gitOrNull,
  ignoreSpecs,
  listPages,
  matchesAny,
  readPage,
  readState,
  shortSha,
  sourcePatterns,
} from "./lib.mjs";

export function run({ root, wikiDir }) {
  const repo = repoAxis(root, wikiDir);
  const pages = listPages(wikiDir).map(readPage);

  // One `git diff` per distinct sha, not one per page.
  const cache = new Map();
  const changesFor = (sha) => {
    if (!cache.has(sha)) cache.set(sha, changedSince(root, sha));
    return cache.get(sha);
  };

  const stale = [];
  const skipped = [];
  const fresh = [];

  for (const page of pages) {
    const meta = page.meta ?? {};
    const sources = [].concat(meta.sources ?? []);
    const synced = meta.synced;
    if (!sources.length || !synced) {
      skipped.push({ id: page.id, reason: "no contract (missing sources or synced)" });
      continue;
    }
    if (!commitExists(root, synced)) {
      skipped.push({ id: page.id, reason: `unknown sha: ${synced}` });
      continue;
    }
    const patterns = sourcePatterns(meta, root);
    const files = changesFor(synced).filter((f) => matchesAny(f, patterns));
    if (files.length) stale.push({ id: page.id, synced, files });
    else fresh.push(page.id);
  }

  return { repo, stale, skipped, fresh, pages: pages.length };
}

function repoAxis(root, wikiDir) {
  const last = readState(wikiDir)?.last_indexed_commit;
  if (!last) return { status: "no-checkpoint" };
  if (!commitExists(root, last)) return { status: "unknown-checkpoint", last };

  const commits = commitsSince(root, last);
  if (!commits) return { status: "current", last, commits: 0, files: 0 };

  const out = gitOrNull(root, ["diff", "--name-only", `${last}..HEAD`, "--", ".", ...ignoreSpecs(wikiDir)]);
  const files = (out ?? "").split("\n").filter((l) => l.trim()).length;
  return { status: files ? "behind" : "current", last, commits, files };
}

/** Human report. Silent when everything is current: the hooks depend on it. */
export function report(res, { verbose } = {}) {
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
    console.log(`${color.red("broken")}    repo — the checkpoint points at ${shortSha(res.repo.last)}, not a commit here`);
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
  }

  for (const item of res.skipped) {
    found++;
    console.log(`${color.red("no-check")}  ${color.bold(item.id)} — ${item.reason}`);
  }

  return found;
}
