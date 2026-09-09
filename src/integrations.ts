import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, rmdirSync, rmSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { Store, atomic, read } from './runtime/store.js';

const header = '<!-- managed by wikipoke; do not edit this line -->';
const marker = 'managed by Wikipoke';
const notifier = '.wikipoke/hooks/post-commit';
const briefing = '.wikipoke/hooks/session-start';
const settings = '.claude/settings.json';
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

## Plan

Run \`${cli} ingest\`. The plan is bounded by \`limits.batchFiles\` and \`limits.batchBytes\`,
so it is meant to be read whole — never truncate it. It answers with:

- \`sources\` — the batch to document, each with \`id\`, \`resource\`, \`revision\`, \`hash\` and \`content\`.
- \`pages\` and \`catalog\` — the wiki context and every existing page, so you connect rather than duplicate.
- \`revision\` — the commit the plan was made against.
- \`complete\` and \`remaining\` — whether anything is left, and how much.

Read the sources and the related pages yourself, and reason in your own flow. Do not modify source code.

## Publish

Get the exact contract with \`${cli} schema patch\`, then publish with \`${cli} publish --patch <file>\`.
Three things the schema states but that are easy to get wrong:

- **Copy each source's \`revision\` and \`hash\` verbatim from the plan into \`meta.sources\`.** They are
  the pinned evidence. Never recompute a hash: it is a SHA-256 of the decoded file content, it is
  already in the plan, and \`publish\` rejects a value that does not match.
- **\`body\` is one Markdown string**, not an array of lines.
- **Declare the plan's \`revision\` in the patch.** Publication is then refused if the sources moved
  while you were working, instead of recording knowledge against code that no longer exists.

## Repeat

One pass documents one batch. Loop — \`ingest\`, publish, \`ingest\` again — until \`complete\` is true,
re-planning each time so the batch reflects what you just published. Prefer a page that carries a
decision and its consequence over one that restates what the code already says.

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

Read the \`suggestedPages\` and the source evidence yourself. Get the contract with
\`${cli} schema answer\`, then persist the answer with
\`${cli} answer --request-id <id> --response <file>\`.

- Every entry in \`citations\` must name a page path or a source id that exists; unknown citations are rejected.
- When the evidence does not exist, declare \`gaps\` instead of inventing support. An answer carried by
  gaps alone closes the query as \`unsupported\`, which is an honest outcome, not a failure.
- \`answered\` is terminal. To revise a closed answer, ask again under a new \`--request-id\`.
`,
  'wikipoke-decision': `---
name: wikipoke-decision
description: Capture an implementation choice or close a task's decision record.
user_invocable: true
---

${header}

${resolve_}

Get the contract with \`${cli} schema event\`, then use \`${cli} capture --event <event.json>\` when a
relevant decision is made, and before closing a task.

- A \`decision\` event requires the \`choice\` that was made; record \`alternatives\` and \`evidence\` when they were stated.
- Do not reconstruct undisclosed rationale from a diff. If nobody said why, close with \`none_declared\`
  and explain in \`rationale\` why no reason is on record. Wikipoke keeps absent rationale as unknown
  rather than guessing, and that is the point.
- An \`open\` event without a matching \`close\` shows up as incomplete capture in the attention signal.
`,
};

const notifierScript = `#!/bin/sh
# ${marker}; safe notifier, never runs an LLM or blocks a commit.
# Refreshes .wikipoke/attention.json in place: a failed run keeps the previous signal.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -n "$root" ] || exit 0
if [ -x "$root/node_modules/.bin/wikipoke" ]; then
  "$root/node_modules/.bin/wikipoke" --root "$root" maintain --once >/dev/null 2>&1 || exit 0
elif command -v npx >/dev/null 2>&1; then
  npx --no-install wikipoke --root "$root" maintain --once >/dev/null 2>&1 || exit 0
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
$cli --root "$root" maintain --once >/dev/null 2>&1 || exit 0
node -e '
const fs = require("node:fs");
try {
  const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const owed = [];
  if (s.uncovered?.count) owed.push(s.uncovered.count + " undocumented source(s)");
  if (s.drift?.count) owed.push(s.drift.count + " page(s) citing moved code");
  if (s.findings?.error) owed.push(s.findings.error + " error finding(s)");
  if (s.tasks?.incomplete) owed.push(s.tasks.incomplete + " task(s) without a recorded decision");
  if (owed.length) process.stdout.write("Wikipoke: " + owed.join(", ") + ". Use the wikipoke-ingest skill to reconcile; the full signal is in .wikipoke/attention.json.\\n");
} catch { /* no signal yet is not a problem worth reporting */ }
' "$root/.wikipoke/attention.json" 2>/dev/null
exit 0
`;
const briefingCommand = `sh ${briefing}`;
const settingsScript = (command: string) => `${JSON.stringify({
  hooks: { SessionStart: [{ matcher: 'startup|resume', hooks: [{ type: 'command', command, timeout: 20 }] }] },
}, null, 2)}\n`;
// Only Claude Code has a session hook Wikipoke can compose without owning the file. The rest are
// told, not configured: a harness config carries permissions and plugins that are not ours to edit,
// and an instruction line an agent reads is a working adapter where no lifecycle hook exists.
const harnesses: [string, string][] = [
  ['Codex', `add a line to AGENTS.md telling the agent to run \`${briefingCommand}\` before it starts work.`],
  ['OpenCode', `no session hook exists; add the same line to AGENTS.md, or run \`${briefingCommand}\` from an opencode.json plugin.`],
  ['Cursor', `no session hook exists; put the same line in a .cursor/rules/ rule file.`],
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
export function install(root: string): InstallReport {
  const store = new Store(root), manual: string[] = [], installed: string[] = [];
  for (const [name, content] of Object.entries(skills)) {
    const path = store.path(`.agents/skills/${name}/SKILL.md`), old = read(path);
    if (old !== null && !old.includes(header)) { manual.push(`Skipped ${relative(root, path)}: not managed by Wikipoke.`); continue; }
    atomic(path, content); installed.push(relative(root, path));
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
  // Composition, not adoption: a harness config the project already owns is never rewritten,
  // because a settings file carries permissions and hooks that are none of Wikipoke's business.
  let activeBriefing = briefingActive(root);
  const configured = store.path(settings);
  if (!activeBriefing && !existsSync(configured)) {
    atomic(configured, settingsScript(briefingCommand));
    activeBriefing = true;
  } else if (!activeBriefing) {
    manual.push(`Claude Code: add a SessionStart hook running \`${briefingCommand}\` to ${settings}; it already exists and was left unchanged.`);
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
    const path = store.path(`.agents/skills/${name}/SKILL.md`), old = read(path);
    if (old === null) continue;
    if (!old.includes(header)) { preserved.push(relative(root, path)); manual.push(`Kept ${relative(root, path)}: not managed by Wikipoke.`); continue; }
    rmSync(path); removed.push(relative(root, path)); prune(dirname(path));
  }
  prune(store.path('.agents/skills')); prune(store.path('.agents'));
  const hook = store.path(notifier);
  if (read(hook) !== null) { rmSync(hook); removed.push(relative(root, hook)); prune(dirname(hook)); }
  const brief = store.path(briefing);
  if (read(brief) !== null) { rmSync(brief); removed.push(relative(root, brief)); prune(dirname(brief)); }
  const configured = store.path(settings);
  const old_ = read(configured);
  if (old_ !== null && old_ === settingsScript(briefingCommand)) { rmSync(configured); removed.push(settings); prune(dirname(configured)); }
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
