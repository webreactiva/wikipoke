import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, rmdirSync, rmSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { Store, atomic, read } from './runtime/store.js';

// The skill text is instructions an agent follows before it reads anything else, so a copy left
// behind by an older release is the most expensive stale file in the project: it sends the agent to
// commands that no longer exist. Stamping the version is what lets anything notice. Recognition uses
// the version-less prefix, so a file written by any release is still ours to replace.
const managed = '<!-- managed by wikipoke';
const version = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
const header = `${managed} ${version}; do not edit this line -->`;
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
description: Take code into the project wiki with Wikipoke - seed it, reconcile what changed, or aim at a part nothing has covered yet.
user_invocable: true
---

${header}

${resolve_}

Write the pages under \`.wikipoke/tmp/pages/\`, which is git-ignored. Anywhere outside the project -
\`/tmp\` and friends - is a sandbox boundary in most harnesses, and asking a human for permission to
write a scratch file is a poor way to spend their attention.

## Plan

Run \`${cli} ingest\`, or \`${cli} ingest --path <directory>\` to aim at a part of the repository whether
or not it ever changed. Aiming is how a wiki gets seeded: left to itself the plan hands over whatever
is next in tree order, and code that was never in a diff is never offered at all.

The plan is bounded by \`limits.batchFiles\` and \`limits.batchBytes\`, so it is meant to be read whole —
never truncate it. It answers with:

- \`sources\` — the batch to document, each with \`id\`, \`revision\` and \`content\`. They are drawn from one
  directory where it can, so the batch is about one thing.
- \`pages\` and \`catalog\` — the wiki context and every existing page, so you connect rather than duplicate.
- \`revision\` — the commit the plan was made against. Pass it back to \`publish --ref\`.
- \`uncommitted\` — in-scope files whose working copy differs from that commit. The plan carries the
  committed version of those files, so documenting one describes code the disk has already moved
  past. Commit first, or leave those files for a later pass.
- \`complete\` and \`remaining\` — whether anything is left in the whole scope, and how much. With
  \`--path\`, \`remainingHere\` is what is left inside the aim; the other two still speak for everything.

Read the sources and the related pages yourself, and reason in your own flow. Do not modify source code.

## Write the pages

One Markdown file per page under \`.wikipoke/tmp/pages/\`, named as you want the page to live in the
wiki — \`.wikipoke/tmp/pages/concepts/retries.md\` publishes as \`concepts/retries.md\`. Frontmatter,
then the prose. Get the exact contract with \`${cli} schema page\`:

    ---
    type: entity
    title: The retry policy
    description: How requests are retried and what decides the limit
    sources:
      - src/http
      - src/config/retries.ts
    ---

    Prose. Ordinary Markdown links, or [[retry-limit]] — both are read as edges. A wikilink
    resolves by file name, not by title: [[retry-limit]], never [[The retry limit]].

## Where a page goes

Wikipoke validates paths and, until you read this, proposed none - which is how a wiki comes out flat,
with whatever folder the first page happened to invent. The taxonomy is:

- \`entities/\` - a module, a subsystem, a thing the code has.
- \`flows/\` - a path through the code that crosses files.
- \`concepts/\` - a convention or an idea that no single file owns.
- \`queries/\` and \`decisions/\` - written by Wikipoke itself. Never publish into them.

So a page with \`type: entity\` goes at \`entities/http.md\`, and \`type: flow\` at
\`flows/one-request.md\`. A project can remap this under \`layout:\` in \`wikipoke.config.yaml\`;
read it before you invent a folder. \`lint\` reports \`unplaced-page\` for a page sitting at the wiki
root when its type has a home.

It is a suggestion, not a rule: a page's identity is its \`uid\`, never its path, so a page can be
moved later and every link to it still resolves. Group by domain instead when the project already
does - the warning only fires on a page with no folder at all, which is nearly always a page nobody
chose a place for.

**\`sources\` are patterns, not a file list.** A directory claims everything under it, a glob claims
what it matches, and a path claims that one file. Claim the module you actually described: \`src/http\`
is one line that covers forty files, and it keeps covering them when a forty-first appears. Wikipoke
resolves each pattern against the plan and writes the revision and the digest into the page itself —
never copy a hash, there is nowhere to put one and nothing to compute.

There is no JSON to assemble and no script to write. If you find yourself generating these files
programmatically, stop: the prose is the work, and a page a script produced from a filename says
nothing a reader could not get from \`ls\`.

Write every page in the plan's \`language\`, whatever language the conversation is happening in. The
wiki outlives the session that produced it and is read by people who never saw that conversation.

## Publish

\`${cli} publish --pages .wikipoke/tmp/pages --ref <the plan's revision>\`

Passing the plan's revision is what lets Wikipoke refuse the publication if the code moved under your
patterns while you were writing, instead of recording knowledge against code that no longer exists.
Only files matching your own patterns count, so somebody committing a typo in a README during your
turn no longer throws the batch away.

Check them first — it costs nothing and writes nothing:

\`${cli} lint --pages .wikipoke/tmp/pages --ref <the plan's revision>\`

It runs every check \`publish\` runs and answers \`publishable\`. Fix what it names, then publish.
Afterwards \`${cli} lint\` reports on the wiki as a whole, which is the same check \`seal\` applies.
Delete the staging directory once the pages are in.

## Flows

Coverage is a file axis: it goes green when every source is claimed by some page, and it never asks
for the page that matters most. A **flow** is the one type no single file can produce - the sequence
several files make together, and the reason the order is what it is. Give it \`type: flow\`, cite every
source it crosses, and spend the page on why the steps are ordered that way and what breaks if they
are reordered. \`lint\` reports \`no-flows\` while the wiki describes code and no page describes a path
through it, and \`thin-flow\` for a flow resting on a single source.

Do not wait for \`ingest\` to ask. It plans from what is uncovered, and a flow that was never written
went missing without any file going uncovered.

## One page per file is not a wiki

Coverage can be reached two ways, and only one of them is worth doing. A page per source file, named
after its path, claims every source and passes every mechanical check while restating what the code
already says - and it rots on the next refactor. Group by what a reader is trying to understand: a
module, a convention, a decision, a path through the code. \`lint\` reports \`mirrors-the-tree\` when the
wiki has about as many pages as there are sources and most of them cite a single file, and \`seal\`
refuses while it does. Patterns are the way out: one page claiming \`src/http\` is a page about the
HTTP layer, and forty pages claiming one file each are a directory listing.

## Repeat

One pass documents one batch. Loop — \`ingest\`, write, publish, \`ingest\` again — until \`complete\` is
true, re-planning each time so the batch reflects what you just published. **Never carry a plan
across passes**: the batch is recomputed every time, and pages written against an old one name files
the new one no longer offers.

When a source in \`drift\` matches nothing any more, the page is not stuck: republish it without that
pattern and say in the body that the module was removed, or repoint it at where the code moved to.
The page stays as the record that the thing existed, which is exactly what a diff cannot tell anyone
six months later. Each drift entry carries a \`remedy\` saying which of the two applies.

A page reported as \`conflict-markers\` was written by a merge, not by a person. Read both sides, merge
them yourself and publish over it - \`publish\` allows that, and only for this case.

## What else is here

- \`${cli} status\` — the full uncovered list, which is unbounded. Prefer \`.wikipoke/attention.json\`,
  the bounded signal refreshed on every commit and at the end of every session. It also counts
  \`uncommitted\` in-scope files: work the wiki cannot see yet because it is not committed.
- \`${cli} graph\` — nodes and edges, to see what a page is connected to before you rewrite it.
- \`${cli} seal\` — certify the wiki is level with the code. It refuses while anything is uncovered,
  drifted, flowless or shaped like the file tree. Run it when the loop is done; do not force it.
- The wiki also holds answered questions (the \`wikipoke-query\` skill) and recorded decisions (the
  \`wikipoke-decision\` skill). Both cite the same sources these pages claim, so a decision about code
  you documented links itself to the page describing it. Read them before researching from scratch.
- \`${cli} --help\` — **read it once per project.** A project can add verbs of its own, marked
  \`(project command)\`, and they are how that project wants a page of its own kind to be written.
  Prefer one over writing the page by hand: it exists because somebody decided the shape.
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

An answered question is a page like any other: it sits in the graph, \`${cli} graph\` shows what it
cites, and the next \`ask\` offers it back. When the answer turns out to be knowledge rather than a
question — something a reader would look for without knowing to ask — write it as a page with the
\`wikipoke-ingest\` skill and let the query cite that page.
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
  Naming files is right here even though knowledge pages claim patterns: a choice was made about
  particular code. The decision page links itself to every page whose pattern covers those files,
  so a decision about \`src/http/retry.ts\` finds the page describing \`src/http\` on its own.
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
  if (s.uncommitted?.count) owed.push(s.uncommitted.count + " in-scope file(s) edited but not committed, which the wiki cannot see yet");
  if (owed.length) process.stdout.write("Wikipoke: " + owed.join(", ") + ". Use the wikipoke-ingest skill to reconcile; the full signal is in .wikipoke/attention.json.\\n");
} catch { /* no signal yet is not a problem worth reporting */ }
// A skill file from an older release is the one stale thing an agent cannot detect by reading it:
// it parses, it reads as authoritative, and it names commands this build does not have.
try {
  const root = process.argv[2], version = process.argv[3];
  if (version) {
    const stale = [];
    for (const home of [".agents/skills", ".claude/skills"]) {
      let names = [];
      try { names = fs.readdirSync(root + "/" + home); } catch { continue; }
      for (const name of names) {
        const file = root + "/" + home + "/" + name + "/SKILL.md";
        let text = ""; try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
        if (text.includes("<!-- managed by wikipoke") && !text.includes("<!-- managed by wikipoke " + version + ";")) stale.push(home + "/" + name);
      }
    }
    if (stale.length) process.stdout.write("Wikipoke: " + stale.length + " installed skill(s) were written by an older release and may name commands this version does not have (" + stale.join(", ") + "). Run: wikipoke install\\n");
  }
} catch { /* an unreadable skill file is a problem for install, not for the briefing */ }
' "$root/.wikipoke/attention.json" "$root" "$($cli --version 2>/dev/null)" 2>/dev/null
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
    if (signal.uncommitted && signal.uncommitted.count) owed.push(signal.uncommitted.count + " in-scope file(s) edited but not committed, which the wiki cannot see yet");
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
// The same deterministic line, at both ends of a session. At the start it says what the wiki already
// owed; at the end it can say something nothing else can - that the agent edited code and left it
// uncommitted, so neither the post-commit hook nor the wiki has seen the work at all. It prints and
// exits zero: an earlier release refused the stop instead, which is why it was taken back out.
const settingsScript = (command: string) => `${JSON.stringify({
  hooks: {
    SessionStart: [{ matcher: 'startup|resume', hooks: [{ type: 'command', command, timeout: 20 }] }],
    Stop: [{ hooks: [{ type: 'command', command, timeout: 20 }] }],
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
const manualSteps: [Harness, string][] = [
  ['codex', `add a line to AGENTS.md telling the agent to run \`${briefingCommand}\` before it starts work.`],
];
const delegatorScript = `#!/bin/sh
# ${marker}; delegates to the project-local notifier, resolved at run time.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
hook="$root/${notifier}"
[ -x "$hook" ] || exit 0
exec "$hook" "$@"
`;

// Which managed skill files are on disk, and whether each was written by this build. A skill from an
// older release parses fine, reads as authoritative and is wrong, so nothing else can detect it.
export function skillState(root: string): { path: string; current: boolean }[] {
  const store = new Store(root), found: { path: string; current: boolean }[] = [];
  for (const name of Object.keys(skills)) for (const home of ['.agents/skills', '.claude/skills']) {
    const relativePath = `${home}/${name}/SKILL.md`, old = read(store.path(relativePath));
    if (old === null || !old.includes(managed)) continue;
    found.push({ path: relativePath, current: old.includes(header) });
  }
  return found;
}
// Which agent this project actually uses. Writing for all of them left `.opencode/` and `.cursor/`
// in repositories that use neither, and a file a project did not ask for is a file somebody has to
// decide whether to commit. The neutral `.agents/skills/` is always written - it is what makes the
// skills readable by anything - and everything harness-shaped is wired only where it belongs.
export const harnesses = ['claude', 'opencode', 'cursor', 'codex'] as const;
export type Harness = (typeof harnesses)[number];
// Evidence that a harness is in use here, generous on purpose: a repository driven by Claude Code
// usually carries a CLAUDE.md before it carries a .claude directory, and missing the harness the
// user is sitting in is a worse failure than wiring one they also use.
const evidence: Record<Harness, string[]> = {
  claude: ['.claude', 'CLAUDE.md'],
  opencode: ['.opencode', 'opencode.json'],
  cursor: ['.cursor', '.cursorrules'],
  codex: ['AGENTS.md'],
};
export function detectHarnesses(root: string): Harness[] {
  return harnesses.filter(name => evidence[name].some(path => {
    try { return existsSync(resolve(root, path)); } catch { return false; }
  }));
}
export interface InstallReport { skills: string[]; harnesses: Harness[]; skipped: Harness[]; hook: string; activeHook: boolean; briefing: string; activeBriefing: boolean; manual: string[] }
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
export function install(root: string, wanted?: Harness[]): InstallReport {
  const store = new Store(root), manual: string[] = [], installed: string[] = [];
  // Named explicitly, or whatever this repository shows evidence of using. An empty list is a real
  // answer - the neutral skills still land, and nothing harness-shaped is written.
  const chosen = new Set<Harness>(wanted ?? detectHarnesses(root));
  const skipped = harnesses.filter(name => !chosen.has(name));
  const ignored_ = ignoreVolatile(root);
  if (ignored_) installed.push(ignored_);
  // `.agents/skills/` is the neutral home and OpenCode reads it. Claude Code does not - verified by
  // a project whose only skill lives there and never appears in the session's skill list - so the
  // same file is written where Claude Code looks. A block message naming a skill the agent cannot
  // invoke is worse than no message at all.
  for (const [name, content] of Object.entries(skills)) {
    for (const home of ['.agents/skills', ...(chosen.has('claude') ? ['.claude/skills'] : [])]) {
      const path = store.path(`${home}/${name}/SKILL.md`), old = read(path);
      if (old !== null && !old.includes(managed)) { manual.push(`Skipped ${relative(root, path)}: not managed by Wikipoke.`); continue; }
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
  if (!chosen.has('claude')) activeBriefing = false;
  else if (!activeBriefing && !existsSync(configured)) {
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
  for (const [harness, path, content] of [['opencode', opencodePlugin, pluginScript],
    ['cursor', cursorRule, cursorScript]] as const) {
    if (!chosen.has(harness)) continue;
    const target = store.path(path), old = read(target);
    if (old !== null && !old.includes(marker) && !old.includes(managed)) {
      manual.push(`Skipped ${path}: not managed by Wikipoke.`); continue;
    }
    atomic(target, content); installed.push(path);
  }
  for (const [harness, step] of manualSteps) if (chosen.has(harness)) manual.push(`${harness}: ${step}`);
  if (skipped.length) manual.push(`Nothing was wired for ${skipped.join(', ')}: no sign of ${
    skipped.length > 1 ? 'them' : 'it'} in this repository. The skills are in .agents/skills/, which any agent-neutral tool reads; wire one explicitly with: wikipoke install --agent ${skipped[0]}`);
  if (!chosen.size) manual.push('No agent harness was detected, so only the neutral skills were written. Name yours with --agent to get the session briefing wired.');
  manual.push('See "Brief the agent at session start" in the Wikipoke README for the exact snippets.');
  manual.push('Schedule `npx --no-install wikipoke maintain --once` to refresh the deterministic attention signal.');
  return { skills: installed, harnesses: [...chosen], skipped, hook: relative(root, hook), activeHook, briefing: relative(root, brief), activeBriefing, manual };
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
      if (!old.includes(managed)) { preserved.push(relative(root, path)); manual.push(`Kept ${relative(root, path)}: not managed by Wikipoke.`); continue; }
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
    if (!old.includes(marker) && !old.includes(managed)) { preserved.push(path); manual.push(`Kept ${path}: not managed by Wikipoke.`); continue; }
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
