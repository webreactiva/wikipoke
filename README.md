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

`install` writes agent-neutral skills under `.agents/skills/` and a hook at
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
moved code, error findings, tasks with no recorded decision — and stays silent
when it owes none. Run it where the agent will see it.

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
    ]
  }
}
```

**Codex** and **OpenCode** have no session hook of this shape. Add one line to
`AGENTS.md`, which both read:

```markdown
At the start of a session, run `sh .wikipoke/hooks/session-start` and act on what it prints.
```

OpenCode can instead run the command from an `opencode.json` plugin, which makes
it automatic rather than advisory.

**Cursor** has no session hook either: put the same line in a `.cursor/rules/`
rule file.

## Operations

```sh
wikipoke doctor
wikipoke status
wikipoke ingest
wikipoke ask "How are payments validated?" --request-id payment-validation
wikipoke answer --request-id payment-validation --response answer.json
wikipoke publish --patch patch.json
wikipoke capture --event decision.json
wikipoke snapshot v1.0.0
wikipoke seal
wikipoke lint
wikipoke graph
wikipoke recover --unlock
wikipoke uninstall
```

Read the full [installation and operation guide](docs/installation.md) for
configuration, scheduling, hooks, queries, task events, and release captures.
Use the [user guide](docs/user-guide.md) for everyday workflows, the
[knowledge format](docs/format.md) for page structure, and the
[architecture guide](docs/architecture.md) for skills, hooks, CLI boundaries,
state, and integration behavior.

`ask` creates a durable query page before the agent researches it; `answer`
validates citations before closing it, and will not overwrite an answer already
closed — revise one by asking again under a new `--request-id`. `wikipoke schema event` emits the task-event
contract, so an agent never reads the implementation to discover it. `capture`
accepts a task event with an ID, task, actor, ISO
timestamp, and `open`, `decision`, or `close` kind. A decision requires `choice`;
a `none_declared` closure requires a rationale. See [operations](docs/operations.md).

## Agent workflow

`ingest` returns a bounded source plan and related wiki context. An installed
agent skill reads that material, reasons in its own native flow, and sends a
structured patch to `publish`. No provider-specific CLI is part of Wikipoke.

## Safety

The library rejects out-of-scope paths, symlink traversal in the wiki, unpinned
source evidence, unknown citations, duplicate event identities, and concurrent
edits. A patch may declare the `revision` it was planned against and is refused
when the sources have moved since. An unreadable page is reported as an
`invalid-page` finding instead of failing every command, and `publish` will not
overwrite it. File publication uses a recovery journal. A snapshot requires
committed wiki content and retains exact Git refs for code and wiki. It does not
archive external source revisions automatically.

## Known limits

These are absent from the product today, not merely undocumented.

- **No divergence detection and no conflict record.** Nothing compares a
  recorded decision against later implemented behavior, and competing claims
  about the same scope are not tracked or resolved. Specification requirements
  FR-008 and FR-009 are unimplemented.
- **No importers for the existing wikis.** There is no migration path for the
  Widgetron or Web Reactiva wikis (FR-014 unimplemented).
- **Snapshots are write-only.** `snapshot` stores Git refs and a manifest under
  `.wikipoke/releases/`, but no command lists, reads, or queries one. Historical
  questions are asked by passing a commit to `ask --ref`, never a release label.
- **No deletion or deprecation.** `publish` can only create or replace pages.
  Removing or marking a page obsolete is a manual Git edit.
- **`seal` demands total coverage.** It refuses while any included source is
  undocumented, any cited hash has drifted, or any error finding stands. With a
  broad `include` that bar is impractical; choose a deliberately narrow scope.
- **Reads take the writer lock.** `status`, `lint`, and `graph` serialize behind
  the same lock as writes, so two concurrent commands fail with a lock error.

The requirement IDs above refer to `docs/sdlc/wikipoke/spec.md` in the
repository, which is not part of the published package.
