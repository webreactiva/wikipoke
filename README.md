# Wikipoke

Wikipoke maintains an OKF-compatible Markdown wiki from versioned project
sources. It preserves questions and agent implementation choices as connected,
citable knowledge. Git is the first source adapter; agents remain responsible
for interpretation and use the CLI only for deterministic plans and writes.

## Install and initialize

Use Node 22 or later, with Git on `PATH`. Wikipoke is not published to a
registry yet: install the local checkout into the project that will own the
wiki. Installing runs `prepare`, which builds `dist/`.

```sh
npm install --save-dev /path/to/wikipoke
npx --no-install wikipoke init --include 'src/**'
npx --no-install wikipoke install
```

The dependency is a path install, so any package manager works; in a workspace
the CLI belongs to the root, not to a member package:

```sh
pnpm add -D -w /path/to/wikipoke   # pnpm workspace root
yarn add --dev /path/to/wikipoke
```

`wikipoke --version` reports the installed build, which is the only way to tell
two path installs apart while there is no registry release.

When developing Wikipoke itself, build it in place and call the CLI directly:

```sh
npm install
npm run build
node dist/cli.js --root /path/to/project doctor
```

`build` clears `dist` and marks `dist/cli.js` executable, which every
path-installed project depends on: its `node_modules/.bin/wikipoke` is a symlink
to that exact file.

`init` refuses to run unless the root is a Git repository with at least one
commit. Do not use a broad glob until excluded/generated paths are understood.

`install` writes agent-neutral skills under `.agents/skills/`, and the same files
under `.claude/skills/` because Claude Code does not read the neutral location —
a hook that tells an agent to use a skill it cannot invoke is worse than saying
nothing. It also writes a hook at
`.wikipoke/hooks/post-commit`, then activates it through a delegating
`post-commit` hook when the repository has none. The hook runs
`maintain --once`, which refreshes `.wikipoke/attention.json`. It resolves the
CLI from `node_modules/.bin/wikipoke`, then `npx --no-install wikipoke`, and
exits silently when neither is present. It never invokes a model and never
blocks a commit. Schedule the same `maintain --once` command if commits are not
the trigger you want.

## Brief the agent at session start

A fresh signal nobody reads changes nothing. `install` also writes
`.wikipoke/hooks/session-start`, a no-LLM script that refreshes the signal and
prints one line when the wiki owes work — undocumented sources, pages citing
moved code, error findings, no flow page, in-scope files edited but not
committed — and stays silent when it owes none. Run it where the agent will see
it.

It belongs at both ends of a session. At the start it says what the wiki already
owed; at the end it can say the one thing nothing else can, that the agent
edited code and left it uncommitted, so no commit hook has had a reason to run.
It prints and exits zero — it never refuses a stop.

Wikipoke composes this for Claude Code only when the project has no
`.claude/settings.json`, and never rewrites one it finds. Every other harness is
told, not configured: a harness config carries permissions and plugins that are
not Wikipoke's to edit. `install` prints the step for each, and `doctor` reports
whether the briefing is composed.

**Claude Code** — in `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "startup|resume",
        "hooks": [{ "type": "command", "command": "sh .wikipoke/hooks/session-start", "timeout": 20 }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "sh .wikipoke/hooks/session-start", "timeout": 20 }] }
    ]
  }
}
```

**Codex** and **OpenCode** have no session hook of this shape. Add one line to
`AGENTS.md`, which both read:

```markdown
At the start of a session, and again when you finish, run `sh .wikipoke/hooks/session-start` and act on what it prints.
```

OpenCode needs no such line: `install` writes `.opencode/plugin/wikipoke.js`,
which OpenCode auto-discovers, and the plugin runs the same no-LLM briefing once
per session.

**Cursor** has no session hook either: put the same line in a `.cursor/rules/`
rule file.

## Attach your own scripts

Wikipoke does the deterministic work and stops there. Whatever a project wants to
happen around it — a notification when pages land, a review before a checkpoint
advances, a reminder to record why the code changed — is attached rather than
built in, by declaring a script in `wikipoke.config.yaml`:

```yaml
extensions:
  - event: publish.after
    run: ./scripts/notify-the-team.sh
  - event: seal.before
    run: ./scripts/require-a-review.sh
    blocking: true
```

The script gets the event as JSON on stdin, runs from the project root, and
answers with its exit status. Twelve events cover the actions that write
something. An observer that fails is reported and never fails the command it was
watching; only a `.before` extension can refuse, and it refuses before anything
is written. Extensions are dispatched outside the writer lock, so a script can
run Wikipoke commands of its own. `doctor` lists what is attached.

Full contract and event table: [extensions](docs/extensions.md).

## Operations

```sh
wikipoke doctor
wikipoke status
wikipoke ingest
wikipoke ask "How are payments validated?" --request-id payment-validation
wikipoke answer --request-id payment-validation --response answer.json
wikipoke ingest --path src/http
wikipoke publish --pages .wikipoke/tmp/pages --ref <planned commit>
wikipoke capture --event .wikipoke/tmp/decision.json
wikipoke seal
wikipoke lint
wikipoke graph
wikipoke recover --unlock
wikipoke uninstall
```

Read the full [installation and operation guide](docs/installation.md) for
configuration, scheduling, hooks, queries, and task events.
Use the [user guide](docs/user-guide.md) for everyday workflows, the
[knowledge format](docs/format.md) for page structure, and the
[architecture guide](docs/architecture.md) for skills, hooks, CLI boundaries,
state, and integration behavior. To attach your own scripts to Wikipoke's
lifecycle instead of asking the tool to grow another setting, see
[extensions](docs/extensions.md).

`ask` creates a durable query page before the agent researches it; `answer`
validates citations before closing it, and will not overwrite an answer already
closed — revise one by asking again under a new `--request-id`. `wikipoke schema event` emits the task-event
contract, so an agent never reads the implementation to discover it. `capture`
accepts a task event with an ID, task, actor, ISO timestamp, and `open`,
`decision`, or `close` kind. A decision requires `choice`, and should carry a
short `title` — without one the page is named after the first sentence of the
choice, which is derived rather than chosen. Its `evidence` is resolved against
the inventory and becomes pinned provenance, so the decision drifts when the code
behind it moves. A `none_declared` closure requires a rationale and must name in
`evidence` the files it covers, which is the honest alternative to inventing a
reason. Nothing asks an agent for any of this: `capture` records a decision when
there is one to record, and a project that wants to be asked attaches its own
script. See [operations](docs/operations.md) and [extensions](docs/extensions.md).

## Agent workflow

`ingest` returns a bounded source plan and related wiki context. An installed
agent skill reads that material, reasons in its own native flow, and sends a
structured patch to `publish`. No provider-specific CLI is part of Wikipoke.

## Safety

The library rejects out-of-scope paths, symlink traversal in the wiki, unpinned
source evidence, unknown citations, duplicate event identities, and concurrent
edits. Evidence is verified by content: a page is refused when a source it cites
has moved, and accepted when somebody else committed something unrelated during
the turn. An unreadable page is reported as an `invalid-page` finding instead of
failing every command, and `publish` will not overwrite it — except for the one
case of unresolved merge conflict markers, which git wrote and nobody is midway
through editing. File publication uses a recovery journal, and neither that
journal nor the writer lock is ever committed.

## Known limits

These are absent from the product today, not merely undocumented.

- **No divergence detection and no conflict record.** Nothing compares a
  recorded decision against later implemented behavior, and competing claims
  about the same scope are not tracked or resolved.
- **No importers for the existing wikis.** There is no migration path for the
  Widgetron or Web Reactiva wikis.
- **Capture cannot be enforced outside Claude Code.** Only Claude Code exposes a
  hook that can refuse a stop. Everywhere else `block` degrades to a notice, and
  a notice is not enough: given a correct one naming every file it had just
  changed, an agent read it and finished the turn anyway.
- **The reason is declared, never observed.** The hooks can prove a file changed
  and never why. Wikipoke records an absent reason as absent rather than
  reconstructing one from a diff, which is the point, but it means an agent that
  declares nothing leaves nothing.
- **No deletion or deprecation.** `publish` can only create or replace pages.
  Removing or marking a page obsolete is a manual Git edit.
- **`seal` demands total coverage.** It refuses while any included source is
  unclaimed, any pattern has drifted, or any error finding stands. A page can
  claim a whole module, so the bar is reachable under a broad `include` — but it
  is still total.
- **Reads take the writer lock.** `status`, `lint`, and `graph` serialize behind
  the same lock as writes, so two concurrent commands fail with a lock error.
