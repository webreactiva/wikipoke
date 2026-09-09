import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, rmdirSync, rmSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { Store, atomic, read } from './runtime/store.js';

const header = '<!-- managed by wikipoke; do not edit this line -->';
const marker = 'managed by Wikipoke';
const notifier = '.wikipoke/hooks/post-commit';
const briefing = '.wikipoke/hooks/session-start';
const journal = '.wikipoke/hooks/tool-journal';
const stop = '.wikipoke/hooks/session-stop';
const settings = '.claude/settings.json';
const opencodePlugin = '.opencode/plugin/wikipoke.js';
const cursorRule = '.cursor/rules/wikipoke.mdc';
const cli = 'wikipoke';
const resolve_ = `Resolve the CLI once and reuse it: \\\`node_modules/.bin/${cli}\\\` when it exists,
otherwise \\\`npx --no-install ${cli}\\\`. Every command below assumes that prefix, written here as \\\`${cli}\\\`.`;
const skills: Record<string, string> = {
  'wikipoke-ingest': `---
name: wikipoke-ingest
description: Reconcile the project wiki with changed source code using Wikipoke.
user_invocable: true
---

${header}

${resolve_}

Write the intermediate JSON files these commands take and produce under \`.wikipoke/tmp/\`, which is
git-ignored. Anywhere outside the project - \`/tmp\` and friends - is a sandbox boundary in most
harnesses, and asking a human for permission to write a scratch file is a poor way to spend their
attention.

## Plan

Run \`${cli} ingest\`. The plan is bounded by \`limits.batchFiles\` and \`limits.batchBytes\`,
so it is meant to be read whole — never truncate it. It answers with:

- \`sources\` — the batch to document, each with \`id\`, \`resource\`, \`revision\`, \`hash\` and \`content\`.
- \`pages\` and \`catalog\` — the wiki context and every existing page, so you connect rather than duplicate.
- \`revision\` — the commit the plan was made against.
- \`uncommitted\` — in-scope files whose working copy differs from that commit. The plan carries the
  committed version of those files, so documenting one describes code the disk has already moved
  past. Commit first, or leave those files for a later pass.
- \`complete\` and \`remaining\` — whether anything is left, and how much.

Read the sources and the related pages yourself, and reason in your own flow. Do not modify source code.

## Publish

Get the exact contract with \`${cli} schema patch\`, then publish with
\`${cli} publish --patch .wikipoke/tmp/patch.json\`.
Three things the schema states but that are easy to get wrong:

- **Copy each source's \`revision\` and \`hash\` verbatim from the plan into \`meta.sources\`.** They are
  the pinned evidence. Never recompute a hash: it is a SHA-256 of the decoded file content, it is
  already in the plan, and \`publish\` rejects a value that does not match.
- **\`body\` is one Markdown string**, not an array of lines.
- **Declare the plan's \`revision\` in the patch.** Publication is then refused if the sources moved
  while you were working, instead of recording knowledge against code that no longer exists.

Write every page in the plan's \`language\`, whatever language the conversation is happening in. The
wiki outlives the session that produced it and is read by people who never saw that conversation.

## Flows

Coverage is a file axis: it goes green when every source is claimed by some page, and it never asks
for the page that matters most. A **flow** is the one type no single file can produce - the sequence
several files make together, and the reason the order is what it is. Give it \`type: flow\`, cite
every source it crosses, and spend the page on why the steps are ordered that way and what breaks if
they are reordered. \`lint\` reports \`no-flows\` while the wiki describes code and no page describes
a path through it, and \`thin-flow\` for a flow resting on a single source.

Do not wait for \`ingest\` to ask. It plans from what changed, and a flow that was never written
went missing without any file going uncovered.

## One page per file is not a wiki

Coverage can be reached two ways, and only one of them is worth doing. A page per source file, named
after its path, claims every source and passes every mechanical check while restating what the code
already says - and it rots on the next refactor. Group by what a reader is trying to understand: a
module, a convention, a decision, a path through the code. \`lint\` reports \`mirrors-the-tree\` when
the wiki has about as many pages as there are sources and most of them cite a single file, and
\`seal\` refuses while it does.

## Repeat

One pass documents one batch. Loop — \`ingest\`, publish, \`ingest\` again — until \`complete\` is true,
re-planning each time so the batch reflects what you just published. Prefer a page that carries a
decision and its consequence over one that restates what the code already says.

When a source in \`drift\` no longer exists, the page is not stuck: republish it without that source
and say in the body that the module was removed, or repoint it at the path the file was renamed to.
The page stays as the record that the thing existed, which is exactly what a diff cannot tell anyone
six months later. Each drift entry carries a \`remedy\` saying which of the two applies.

A page reported as \`conflict-markers\` was written by a merge, not by a person. Read both sides,
merge them yourself and publish over it - \`publish\` allows that, and only for this case.

Read \`.wikipoke/attention.json\` for the bounded health signal; it is refreshed on every commit.
Use \`${cli} status\` only when you need the full uncovered list, which is unbounded.
`,
  'wikipoke-query': `---
name: wikipoke-query
description: Ask Wikipoke a grounded question and preserve the query record.
user_invocable: true
---

${header}

${resolve_}

Run \`${cli} ask "<question>" --request-id <id>\` first: it creates the durable query page before
any research, so the question survives even if you fail to answer it. Use \`--ref <commit>\` for a
question about historical code.

When the same question has already been answered against evidence that has not moved, \`ask\` returns
that answer with \`reused: true\` and writes no new page. That is the answer - read it and stop. Pass
\`--again\` only when you have a reason to research it a second time.

\`ask\` answers with \`priorAnswers\` — questions already answered whose wording overlaps yours. Read
those first: one may already answer you, and reusing a cited answer beats researching the same
ground twice. \`suggestedPages\` carries the knowledge pages worth reading. Read them and the source
evidence yourself. Get the contract with \`${cli} schema answer\`, then persist the answer with
\`${cli} answer --request-id <id> --response .wikipoke/tmp/answer.json\`. Keep that file, and any
event JSON, under \`.wikipoke/tmp/\`: it is git-ignored and inside the project, so no harness has to
ask anyone for permission to write a scratch file.

- Every entry in \`citations\` must name a page path or a source id that exists; unknown citations are
  rejected. Both are real: a source id pins provenance, a page path becomes an \`asks_about\` relation
  that connects the answered question to the page it was answered from. Cite the pages you actually
  read, not only the files.
- When the evidence does not exist, declare \`gaps\` instead of inventing support. An answer carried by
  gaps alone closes the query as \`unsupported\`, which is an honest outcome, not a failure.
- \`answered\` is terminal. To revise a closed answer, ask again under a new \`--request-id\`.
- Write the answer in the wiki's \`language\`, which \`ask\` reports, not in the language of the
  question. A wiki that stores whichever language each session happened to use is not readable as one.
`,
  'wikipoke-decision': `---
name: wikipoke-decision
description: Capture an implementation choice or close a task's decision record.
user_invocable: true
---

${header}

${resolve_}

Get the contract with \`${cli} schema event\`, then use
\`${cli} capture --event .wikipoke/tmp/event.json\` when a relevant decision is made, and before
closing a task. Write that file under \`.wikipoke/tmp/\`, which is git-ignored and inside the project.

A task is a piece of work that reached a choice worth remembering — not every file you document.
Open one when you expect to record a decision under it.

- Give every decision a short \`title\` - a name, three to eight words. It becomes the page name and
  the line in the change log. Without one the first sentence of the choice is used, which is a
  derived name, not a chosen one.
- \`evidence\` is not decoration. Each file in it that is inside the configured scope is resolved
  against the inventory and pinned into the page's \`sources\`, which is what puts the decision in the
  graph next to the code and the pages describing it, and what later reports the choice as drifted
  when that code moves. Evidence naming a file outside scope is kept in the body, unverified.
- A \`decision\` event requires the \`choice\` that was made, and \`evidence\` naming the source files the
  choice is about. That is what ties a decision to code, and what later reports the choice as drifted
  when that code moves. Capture the decision when you make the change, not in a later documentation
  pass — a backdated tape explains nothing, and by then the reason is gone.
- Record \`alternatives\` when they were stated.
- Do not reconstruct undisclosed rationale from a diff. If nobody said why, close with \`none_declared\`,
  name in that closure's \`evidence\` the source files it covers, and explain in \`rationale\` why no
  reason is on record. That is a real answer and it settles those files: Wikipoke keeps absent
  rationale as unknown rather than guessing, and that is the point. Never invent one — a fabricated
  reason is worse than a recorded absence.
- A task that records no decision publishes no page: the events are kept, and \`capture\` answers
  \`materialized: false\`. Do not open and close empty tasks to look thorough — it writes nothing
  and only shows up as incomplete capture in \`status\`.
- An \`open\` event without a matching \`close\` shows up there the same way.
- Nothing asks you for this. Wikipoke records a decision when you have one and never nags for one you
  do not: a reason invented to satisfy a reminder is the failure this command exists to avoid. A
  project that does want to be asked attaches its own script — see \`docs/extensions.md\`.
`,
};

const notifierScript = `#!/bin/sh
# ${marker}; safe notifier, never runs an LLM or blocks a commit.
# Refreshes .wikipoke/attention.json in place: a failed run keeps the previous signal.
# The refresh reads every source in scope, which on a large repository costs the better part of a
# second. Paid on every commit that is a tax people eventually uninstall, and nothing waits on the
# result - the signal is read at the start of the next session, not at the end of this commit. So it
# is detached: the commit returns immediately and the file is rewritten a moment later. A second
# commit arriving mid-refresh finds the writer lock held, exits silently, and leaves the previous
# signal standing, which is the same thing that already happens when the refresh fails.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -n "$root" ] || exit 0
if [ -x "$root/node_modules/.bin/wikipoke" ]; then
  ( "$root/node_modules/.bin/wikipoke" --root "$root" maintain --once >/dev/null 2>&1 & ) >/dev/null 2>&1
elif command -v npx >/dev/null 2>&1; then
  ( npx --no-install wikipoke --root "$root" maintain --once >/dev/null 2>&1 & ) >/dev/null 2>&1
fi
exit 0
`;
// The post-commit notifier keeps the signal fresh, but a fresh file nobody reads changes
// nothing: an agent opens a session blind unless its harness puts the debt in front of it.
// This is the same no-LLM command, printing a one-line brief and staying silent when clean.
const briefingScript = `#!/bin/sh
# ${marker}; session briefing, never runs an LLM and never fails a session.
# Refreshes the attention signal, then prints one line when the wiki owes work.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -f "$root/wikipoke.config.yaml" ] || exit 0
if [ -x "$root/node_modules/.bin/wikipoke" ]; then
  cli="$root/node_modules/.bin/wikipoke"
elif command -v npx >/dev/null 2>&1; then
  cli="npx --no-install wikipoke"
else
  exit 0
fi
# A wiki that cannot run and a wiki with nothing to report both printed nothing. Silence has to mean
# one thing only, so the two states that produce it on purpose say so before anything else.
if [ -d "$root/.wikipoke/write.lock" ]; then
  echo "Wikipoke: the writer lock is held, so every Wikipoke command will fail. If no other agent is running, release it with: wikipoke recover --unlock"
  exit 0
fi
$cli --root "$root" maintain --once >/dev/null 2>&1 || exit 0
node -e '
const fs = require("node:fs");
try {
  const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const owed = [];
  if (s.uncovered?.count) owed.push(s.uncovered.count + " undocumented source(s)");
  if (s.drift?.count) owed.push(s.drift.count + " page(s) citing moved code");
  if (s.findings?.error) owed.push(s.findings.error + " error finding(s)");
  if (s.flows?.missing) owed.push("no flow page describing how the code runs end to end");
  if (owed.length) process.stdout.write("Wikipoke: " + owed.join(", ") + ". Use the wikipoke-ingest skill to reconcile; the full signal is in .wikipoke/attention.json.\\n");
} catch { /* no signal yet is not a problem worth reporting */ }
' "$root/.wikipoke/attention.json" 2>/dev/null
exit 0
`;
const briefingCommand = `sh ${briefing}`;
// OpenCode auto-discovers any .js in .opencode/plugin/ with no config entry, so the briefing rides a
// real lifecycle hook there instead of an instruction a human has to remember to paste. The plugin
// runs the same no-LLM script, once per session: refreshing on every turn would take the writer lock
// out from under the agent's own Wikipoke commands.
const pluginScript = `// ${marker}; briefs the agent with what the wiki owes.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The briefing runs the maintenance pass, which takes the writer lock, so it runs once per session.
// But debt appears mid-session - the first page published is what makes a missing flow reportable -
// and a briefing frozen at startup can never say so. So the expensive pass stays once per session
// and the signal it leaves behind is re-read from disk, which costs a file read and no lock at all.
const briefed = new Map(), refreshed = new Map();
function brief(key, directory) {
  if (!briefed.has(key)) {
    let signal = "";
    try {
      signal = execFileSync("sh", ["${briefing}"], {
        cwd: directory, encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch { signal = ""; }
    briefed.set(key, signal);
    return signal;
  }
  const now = Date.now(), cached = refreshed.get(key);
  if (cached && now - cached.at < 60000) return cached.line;
  let line = briefed.get(key);
  try {
    const signal = JSON.parse(readFileSync(join(directory, ".wikipoke", "attention.json"), "utf8"));
    const owed = [];
    if (signal.uncovered && signal.uncovered.count) owed.push(signal.uncovered.count + " undocumented source(s)");
    if (signal.drift && signal.drift.count) owed.push(signal.drift.count + " page(s) citing moved code");
    if (signal.findings && signal.findings.error) owed.push(signal.findings.error + " error finding(s)");
    if (signal.flows && signal.flows.missing) owed.push("no flow page describing how the code runs end to end");
    line = owed.length ? "Wikipoke: " + owed.join(", ") + ". Use the wikipoke-ingest skill to reconcile;" +
      " the full signal is in .wikipoke/attention.json." : "";
  } catch { /* no signal on disk yet leaves the startup briefing standing */ }
  refreshed.set(key, { at: now, line });
  return line;
}
export const wikipoke = async ({ directory }) => ({
  "experimental.chat.system.transform": async (input, output) => {
    const signal = brief(input?.sessionID ?? directory, directory);
    if (signal) output.system.push(signal);
  },
});
export default wikipoke;
`;
const cursorScript = `---
description: Wikipoke knowledge wiki
alwaysApply: true
---

${header}

At the start of a session, run \`${briefingCommand}\` and act on what it prints. It is deterministic,
never runs a model, and stays silent when the wiki owes no work.
`;
const settingsScript = (command: string) => `${JSON.stringify({
  hooks: {
    SessionStart: [{ matcher: 'startup|resume', hooks: [{ type: 'command', command, timeout: 20 }] }],
  },
}, null, 2)}\n`;
// What an older release wrote into the same file: the briefing plus a hook on every edit and a hook
// that refused every stop. Recognised by exact content and only there, so an upgrade can take its own
// automation back out of a file it wrote, and leave a file it did not write alone.
const legacySettings = `${JSON.stringify({
  hooks: {
    SessionStart: [{ matcher: 'startup|resume', hooks: [{ type: 'command', command: `sh ${briefing}`, timeout: 20 }] }],
    PostToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [{ type: 'command', command: `sh ${journal}`, timeout: 10 }] }],
    Stop: [{ hooks: [{ type: 'command', command: `sh ${stop}`, timeout: 30 }] }],
  },
}, null, 2)}\n`;
// Only Claude Code has a session hook Wikipoke can compose without owning the file. The rest are
// told, not configured: a harness config carries permissions and plugins that are not ours to edit,
// and an instruction line an agent reads is a working adapter where no lifecycle hook exists.
// Codex is the one harness left without a file Wikipoke can own: it reads AGENTS.md, which the
// project writes, so it gets a named step instead of an edited config.
const harnesses: [string, string][] = [
  ['Codex', `add a line to AGENTS.md telling the agent to run \`${briefingCommand}\` before it starts work.`],
];
const delegatorScript = `#!/bin/sh
# ${marker}; delegates to the project-local notifier, resolved at run time.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
hook="$root/${notifier}"
[ -x "$hook" ] || exit 0
exec "$hook" "$@"
`;

export interface InstallReport { skills: string[]; hook: string; activeHook: boolean; briefing: string; activeBriefing: boolean; manual: string[] }
export interface UninstallReport { removed: string[]; preserved: string[]; manual: string[] }
function hookPath(root: string): string {
  const value = execFileSync('git', ['-C', root, 'rev-parse', '--git-path', 'hooks'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  return value.startsWith('/') ? value : `${root}/${value}`;
}
export function hookActive(root: string): boolean {
  try { return read(`${hookPath(root)}/post-commit`)?.includes(notifier) ?? false; }
  catch { return false; }
}
export function briefingActive(root: string): boolean {
  return read(resolve(root, settings))?.includes(briefing) ?? false;
}
// A commit carrying the writer lock clones into a repository that is locked from birth: every
// command fails and the session briefing - the one channel anyone reads - stays silent, because
// silence is also what a healthy wiki prints. The post-commit hook rewrites the attention signal, so
// the tree is dirty right after every commit and `git add -A` becomes the habit. Two lines in
// .gitignore make that habit harmless. The rest of .wikipoke/ is knowledge and must stay versioned.
function ignoreVolatile(root: string): string | null {
  const path = resolve(root, '.gitignore'), current = read(path);
  const wanted = ['.wikipoke/write.lock/', '.wikipoke/transaction.json', '.wikipoke/tmp/'];
  const missing = wanted.filter(entry => !(current ?? '').split('\n').some(line => line.trim() === entry));
  if (!missing.length) return null;
  const body = current ?? '';
  atomic(path, `${body}${body && !body.endsWith('\n') ? '\n' : ''}${body ? '\n' : ''}# ${marker}: never commit the writer lock or an in-flight transaction\n${missing.join('\n')}\n`);
  return '.gitignore';
}
export function install(root: string): InstallReport {
  const store = new Store(root), manual: string[] = [], installed: string[] = [];
  const ignored_ = ignoreVolatile(root);
  if (ignored_) installed.push(ignored_);
  // `.agents/skills/` is the neutral home and OpenCode reads it. Claude Code does not - verified by
  // a project whose only skill lives there and never appears in the session's skill list - so the
  // same file is written where Claude Code looks. A block message naming a skill the agent cannot
  // invoke is worse than no message at all.
  for (const [name, content] of Object.entries(skills)) {
    for (const home of ['.agents/skills', '.claude/skills']) {
      const path = store.path(`${home}/${name}/SKILL.md`), old = read(path);
      if (old !== null && !old.includes(header)) { manual.push(`Skipped ${relative(root, path)}: not managed by Wikipoke.`); continue; }
      atomic(path, content); installed.push(`${home}/${name}/SKILL.md`);
    }
  }
  const hook = store.path(notifier);
  atomic(hook, notifierScript);
  chmodSync(hook, 0o755);
  let activeHook = false;
  const target = `${hookPath(root)}/post-commit`;
  if (!existsSync(target)) {
    atomic(target, delegatorScript);
    chmodSync(target, 0o755);
    activeHook = true;
  } else if (hookActive(root)) activeHook = true;
  else manual.push(`Compose ${relative(root, hook)} from the project's existing post-commit hook manager.`);
  const brief = store.path(briefing);
  atomic(brief, briefingScript);
  chmodSync(brief, 0o755);
  // Upgrading from a release that wrote a hook on every edit and a hook on every stop. Leaving those
  // scripts on disk would leave them running: the harness config still points at them, and a file
  // Wikipoke wrote and no longer installs is Wikipoke's to take away.
  const retired = [journal, stop].filter(path => read(store.path(path)) !== null);
  for (const path of retired) { rmSync(store.path(path)); }
  // Composition, not adoption: a harness config the project already owns is never rewritten,
  // because a settings file carries permissions and hooks that are none of Wikipoke's business.
  let activeBriefing = briefingActive(root);
  const configured = store.path(settings);
  if (!activeBriefing && !existsSync(configured)) {
    atomic(configured, settingsScript(briefingCommand));
    activeBriefing = true;
  } else if (!activeBriefing) {
    manual.push(`Claude Code: ${settings} already exists and was left unchanged. Add one hook to it by hand: SessionStart running \`${briefingCommand}\`.`);
  }
  // The same upgrade, in the file the hooks were wired from. Rewritten only when its content is
  // exactly what an older Wikipoke wrote - anything a human has since touched is theirs, and gets a
  // named step instead of an edit.
  const previous = read(configured);
  if (previous === legacySettings) atomic(configured, settingsScript(briefingCommand));
  else if (previous !== null && (previous.includes(journal) || previous.includes(stop))) {
    manual.push(`Claude Code: ${settings} still runs \`${journal}\` and \`${stop}\`, which Wikipoke no longer installs. Remove those two hooks by hand; the file carries settings Wikipoke did not write, so it was left unchanged.`);
  }
  if (retired.length) manual.push(`Removed ${retired.join(' and ')}: automatic decision capture is no longer built in. Attach your own script instead - see docs/extensions.md.`);
  // These two harnesses auto-discover a file of their own, so the briefing pushes itself rather than
  // waiting for a human to paste an instruction that, unpasted, means nothing happens at all.
  for (const [path, content] of [[opencodePlugin, pluginScript], [cursorRule, cursorScript]] as const) {
    const target = store.path(path), old = read(target);
    if (old !== null && !old.includes(marker) && !old.includes(header)) {
      manual.push(`Skipped ${path}: not managed by Wikipoke.`); continue;
    }
    atomic(target, content); installed.push(path);
  }
  for (const [harness, step] of harnesses) manual.push(`${harness}: ${step}`);
  manual.push('See "Brief the agent at session start" in the Wikipoke README for the exact snippets.');
  manual.push('Schedule `npx --no-install wikipoke maintain --once` to refresh the deterministic attention signal.');
  return { skills: installed, hook: relative(root, hook), activeHook, briefing: relative(root, brief), activeBriefing, manual };
}
function prune(directory: string): void { try { rmdirSync(directory); } catch { /* keep non-empty directories */ } }
function wikiDirectory(root: string): string {
  try {
    const raw = read(resolve(root, 'wikipoke.config.yaml'));
    const value = raw === null ? null : (parse(raw) as { wiki?: unknown }).wiki;
    return typeof value === 'string' && value ? value : 'wiki';
  } catch { return 'wiki'; }
}
export function uninstall(root: string): UninstallReport {
  const store = new Store(root), removed: string[] = [], preserved: string[] = [], manual: string[] = [];
  for (const name of Object.keys(skills)) {
    for (const home of ['.agents/skills', '.claude/skills']) {
      const path = store.path(`${home}/${name}/SKILL.md`), old = read(path);
      if (old === null) continue;
      if (!old.includes(header)) { preserved.push(relative(root, path)); manual.push(`Kept ${relative(root, path)}: not managed by Wikipoke.`); continue; }
      rmSync(path); removed.push(relative(root, path)); prune(dirname(path));
    }
  }
  for (const home of ['.agents/skills', '.agents', '.claude/skills']) prune(store.path(home));
  const hook = store.path(notifier);
  if (read(hook) !== null) { rmSync(hook); removed.push(relative(root, hook)); prune(dirname(hook)); }
  // `journal` and `stop` are no longer installed; they stay in this list so a project that still
  // carries them from an older release is left clean rather than half-uninstalled.
  for (const path of [briefing, journal, stop]) {
    const target = store.path(path);
    if (read(target) !== null) { rmSync(target); removed.push(relative(root, target)); prune(dirname(target)); }
  }
  for (const path of [opencodePlugin, cursorRule]) {
    const target = store.path(path), old = read(target);
    if (old === null) continue;
    if (!old.includes(marker) && !old.includes(header)) { preserved.push(path); manual.push(`Kept ${path}: not managed by Wikipoke.`); continue; }
    rmSync(target); removed.push(path); prune(dirname(target)); prune(dirname(dirname(target)));
  }
  const configured = store.path(settings);
  const old_ = read(configured);
  if (old_ !== null && (old_ === settingsScript(briefingCommand) || old_ === legacySettings)) { rmSync(configured); removed.push(settings); prune(dirname(configured)); }
  else if (old_ !== null && old_.includes(briefing)) { preserved.push(settings); manual.push(`Remove the ${briefing} session hook from ${settings} by hand: the file carries settings Wikipoke did not write.`); }
  try {
    const target = `${hookPath(root)}/post-commit`, old = read(target);
    if (old !== null && old.includes(marker) && old.includes(notifier)) { rmSync(target); removed.push(relative(root, target)); }
    else if (old !== null) { preserved.push(relative(root, target)); manual.push(`Kept ${relative(root, target)}: not installed by Wikipoke.`); }
  } catch { manual.push('Skipped the Git hook: no repository at this root.'); }
  for (const name of [wikiDirectory(root), 'wikipoke.config.yaml', '.wikipoke/state.json',
    '.wikipoke/events', '.wikipoke/releases', '.wikipoke/attention.json']) {
    try { if (existsSync(store.path(name))) preserved.push(name); } catch { /* a hand-edited wiki path stays untouched */ }
  }
  return { removed, preserved, manual };
}
