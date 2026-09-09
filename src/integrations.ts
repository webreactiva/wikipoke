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

When the same question has already been answered against evidence that has not moved, \`ask\` returns
that answer with \`reused: true\` and writes no new page. That is the answer - read it and stop. Pass
\`--again\` only when you have a reason to research it a second time.

\`ask\` answers with \`priorAnswers\` — questions already answered whose wording overlaps yours. Read
those first: one may already answer you, and reusing a cited answer beats researching the same
ground twice. \`suggestedPages\` carries the knowledge pages worth reading. Read them and the source
evidence yourself. Get the contract with
\`${cli} schema answer\`, then persist the answer with
\`${cli} answer --request-id <id> --response <file>\`.

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

Get the contract with \`${cli} schema event\`, then use \`${cli} capture --event <event.json>\` when a
relevant decision is made, and before closing a task.

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
  choice is about. That is what ties a decision to code: source that moved since the sealed checkpoint
  and appears in no decision's evidence is reported as changed with no reason on record. Capture the
  decision when you make the change, not in a later documentation pass — a backdated tape explains nothing.
- Record \`alternatives\` when they were stated.
- Do not reconstruct undisclosed rationale from a diff. If nobody said why, close with \`none_declared\`
  and explain in \`rationale\` why no reason is on record. Wikipoke keeps absent rationale as unknown
  rather than guessing, and that is the point.
- A task that records no decision publishes no page: the events are kept, and \`capture\` answers
  \`materialized: false\`. Do not open and close empty tasks to look thorough — it writes nothing
  and only shows up as incomplete capture.
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
  if (s.unexplained?.count) owed.push(s.unexplained.count + " changed source(s) with no decision recorded");
  if (s.tasks?.incomplete) owed.push(s.tasks.incomplete + " task(s) without a recorded decision");
  if (s.flows?.missing) owed.push("no flow page describing how the code runs end to end");
  if (owed.length) process.stdout.write("Wikipoke: " + owed.join(", ") + ". Use the wikipoke-ingest skill to reconcile; the full signal is in .wikipoke/attention.json.\\n");
} catch { /* no signal yet is not a problem worth reporting */ }
' "$root/.wikipoke/attention.json" 2>/dev/null
exit 0
`;
// Two halves of the same job. This one runs on every edit, so it does the least work that is still
// useful: no config parse, no Git, no writer lock, no wikipoke import - one appended line naming the
// file a tool touched. Scope and meaning are resolved later, by whoever reads the journal.
const journalScript = `#!/bin/sh
# ${marker}; records which files a tool touched. Never runs an LLM and never fails a tool.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -f "$root/wikipoke.config.yaml" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0
node -e '
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { raw += chunk; });
process.stdin.on("end", () => {
  try {
    const fs = require("node:fs"), path = require("node:path");
    const event = JSON.parse(raw), input = event.tool_input || {};
    const file = input.file_path || input.notebook_path || input.path;
    if (!file) return;
    // A repository reached through a symlinked parent - /tmp on macOS, a linked checkout anywhere -
    // answers rev-parse with the real path while the harness reports the one the user typed. Compared
    // as written, every edit in such a tree looks like it happened outside the project.
    const real = target => { try { return fs.realpathSync(target); } catch { return path.resolve(target); } };
    const root = real(process.argv[1]);
    const rel = path.relative(root, real(path.resolve(root, file)));
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return;
    const id = String(event.session_id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 96) || "unknown";
    const directory = path.join(root, ".wikipoke", "journal");
    fs.mkdirSync(directory, { recursive: true });
    fs.appendFileSync(path.join(directory, id + ".jsonl"), JSON.stringify({
      at: new Date().toISOString(), file: rel.split(path.sep).join("/"),
      tool: event.tool_name || "edit", actor: "agent/claude-code", session: id,
    }) + "\\n");
  } catch { /* a journal line is never worth failing an edit over */ }
});
' "$root" 2>/dev/null
exit 0
`;
// The other half, and the whole point of the pair: it runs once, when the agent tries to stop, which
// is the last moment the reason for a change still exists anywhere. \`block\` sends the agent back to
// record it; \`remind\` only tells the human. Reconstructing the same rationale tomorrow from a diff
// is exactly the fiction Wikipoke refuses to write.
const stopScript = `#!/bin/sh
# ${marker}; asks for the reason while the agent that made the change is still running.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -f "$root/wikipoke.config.yaml" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0
node -e '
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { raw += chunk; });
process.stdin.on("end", () => {
  try {
    const cp = require("node:child_process"), fs = require("node:fs"), path = require("node:path");
    const root = process.argv[1];
    let event = {};
    try { event = JSON.parse(raw); } catch { return; }
    // A stop that was already blocked once has had its chance; asking again is how a hook loops.
    if (event.stop_hook_active) return;
    const id = String(event.session_id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 96);
    if (!id) return;
    const local = path.join(root, "node_modules", ".bin", "wikipoke");
    const bin = fs.existsSync(local) ? local : "npx";
    const head = bin === "npx" ? ["--no-install", "wikipoke"] : [];
    let out = "";
    try {
      out = cp.execFileSync(bin, head.concat(["--root", root, "journal", "--session", id]),
        { encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "ignore"] });
    } catch { return; }
    let report = {};
    try { report = JSON.parse(out); } catch { return; }
    const pending = report.unexplained || [];
    if (report.mode === "off" || !pending.length) return;
    const reason = "Wikipoke: this session changed " + pending.length +
      " source file(s) with no decision recorded: " + pending.slice(0, 10).join(", ") +
      ". Capture the choice with the wikipoke-decision skill, naming those files as evidence." +
      " If the change carries no decision worth keeping, close the task with none_declared and say why.";
    if (report.mode === "block") process.stdout.write(JSON.stringify({ decision: "block", reason }) + "\\n");
    else process.stdout.write(JSON.stringify({ systemMessage: reason }) + "\\n");
  } catch { /* a missing journal is not a reason to trap an agent in its turn */ }
});
' "$root" 2>/dev/null
exit 0
`;
const briefingCommand = `sh ${briefing}`;
// OpenCode auto-discovers any .js in .opencode/plugin/ with no config entry, so the briefing rides a
// real lifecycle hook there instead of an instruction a human has to remember to paste. The plugin
// runs the same no-LLM script, once per session: refreshing on every turn would take the writer lock
// out from under the agent's own Wikipoke commands.
const pluginScript = `// ${marker}; briefs the agent and records which sources it edits.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

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
    if (signal.unexplained && signal.unexplained.count) owed.push(signal.unexplained.count + " changed source(s) with no decision recorded");
    if (signal.tasks && signal.tasks.incomplete) owed.push(signal.tasks.incomplete + " task(s) without a recorded decision");
    if (signal.flows && signal.flows.missing) owed.push("no flow page describing how the code runs end to end");
    line = owed.length ? "Wikipoke: " + owed.join(", ") + ". Use the wikipoke-ingest skill to reconcile;" +
      " the full signal is in .wikipoke/attention.json." : "";
  } catch { /* no signal on disk yet leaves the startup briefing standing */ }
  refreshed.set(key, { at: now, line });
  return line;
}
// OpenCode exposes no hook that can refuse a stop, so the debt is put where the agent cannot miss it
// instead: its own system prompt, refreshed at most once a minute. \`journal\` takes no writer lock,
// which is what makes asking this repeatedly while the agent works safe.
const owed = new Map();
function debt(directory, sessionID) {
  const now = Date.now(), cached = owed.get(sessionID);
  if (cached && now - cached.at < 60000) return cached.line;
  let line = "";
  try {
    const local = join(directory, "node_modules", ".bin", "wikipoke");
    const bin = existsSync(local) ? local : "npx";
    const head = bin === "npx" ? ["--no-install", "wikipoke"] : [];
    const out = execFileSync(bin, head.concat(["--root", directory, "journal", "--session", sessionID]),
      { encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "ignore"] });
    const report = JSON.parse(out), pending = report.unexplained || [];
    if (report.mode !== "off" && pending.length)
      line = "Wikipoke: this session has changed " + pending.length + " source file(s) with no decision recorded: " +
        pending.slice(0, 10).join(", ") + ". Capture the choice with the wikipoke-decision skill, naming those" +
        " files as evidence, before you finish. If there is no decision worth keeping, close the task with" +
        " none_declared and say why.";
  } catch { line = ""; }
  owed.set(sessionID, { at: now, line });
  return line;
}
const editing = new Set(["edit", "write", "patch", "multiedit", "notebookedit"]);
function record(directory, sessionID, tool, args) {
  try {
    // Tool argument names are not part of the plugin contract, so every plausible spelling is tried
    // and an unrecognised shape is simply not journalled. A missed line is cheaper than a thrown hook.
    const file = args && (args.filePath || args.file_path || args.path || args.file || args.notebookPath);
    if (typeof file !== "string" || !file) return;
    const root = realpathSync(directory);
    let target;
    try { target = realpathSync(resolve(root, file)); } catch { target = resolve(root, file); }
    const rel = relative(root, target);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) return;
    const id = String(sessionID || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 96) || "unknown";
    const directory_ = join(root, ".wikipoke", "journal");
    mkdirSync(directory_, { recursive: true });
    appendFileSync(join(directory_, id + ".jsonl"), JSON.stringify({
      at: new Date().toISOString(), file: rel.split(sep).join("/"),
      tool: String(tool || "edit"), actor: "agent/opencode", session: id,
    }) + "\\n");
  } catch { /* a journal line is never worth failing an edit over */ }
}

export const wikipoke = async ({ directory }) => ({
  "experimental.chat.system.transform": async (input, output) => {
    const session = input?.sessionID;
    const signal = brief(session ?? directory, directory);
    if (signal) output.system.push(signal);
    if (session) {
      const pending = debt(directory, session);
      if (pending) output.system.push(pending);
    }
  },
  "tool.execute.after": async (input) => {
    if (!editing.has(String(input?.tool ?? "").toLowerCase())) return;
    record(directory, input.sessionID, input.tool, input.args);
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
// The pair only works together: a journal nobody reads at the end of a turn records edits into a
// file, and a stop hook with no journal has nothing to confront the agent with.
export function captureActive(root: string): boolean {
  const configured = read(resolve(root, settings));
  return !!configured && configured.includes(journal) && configured.includes(stop);
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
  for (const [path, content] of [[briefing, briefingScript], [journal, journalScript], [stop, stopScript]] as const) {
    const target = store.path(path);
    atomic(target, content);
    chmodSync(target, 0o755);
  }
  const brief = store.path(briefing);
  // Composition, not adoption: a harness config the project already owns is never rewritten,
  // because a settings file carries permissions and hooks that are none of Wikipoke's business.
  let activeBriefing = briefingActive(root);
  const configured = store.path(settings);
  if (!activeBriefing && !existsSync(configured)) {
    atomic(configured, settingsScript(briefingCommand));
    activeBriefing = true;
  } else if (!activeBriefing) {
    manual.push(`Claude Code: ${settings} already exists and was left unchanged. Add three hooks to it by hand: SessionStart running \`${briefingCommand}\`, PostToolUse on Edit|Write|MultiEdit|NotebookEdit running \`sh ${journal}\`, and Stop running \`sh ${stop}\`. Without the last two, a decision is only captured when somebody remembers to, which is after the reason is gone.`);
  }
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
    const path = store.path(`.agents/skills/${name}/SKILL.md`), old = read(path);
    if (old === null) continue;
    if (!old.includes(header)) { preserved.push(relative(root, path)); manual.push(`Kept ${relative(root, path)}: not managed by Wikipoke.`); continue; }
    rmSync(path); removed.push(relative(root, path)); prune(dirname(path));
  }
  prune(store.path('.agents/skills')); prune(store.path('.agents'));
  const hook = store.path(notifier);
  if (read(hook) !== null) { rmSync(hook); removed.push(relative(root, hook)); prune(dirname(hook)); }
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
