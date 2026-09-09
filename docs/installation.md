# Installation and operation

Wikipoke maintains an evidence-led, editable wiki. Source code remains the
authority for documented behavior; the wiki is not a replacement for source
control or review.

## Install the CLI

Wikipoke requires Node 22 or later and Git for its code-source adapter. Until a
registry release exists, add the local checkout to each maintained project so
agent skills and hooks can find the CLI without downloading anything at runtime.
Installing runs `prepare`, which builds `dist/` in the checkout:

```sh
npm install --save-dev /path/to/wikipoke
npx --no-install wikipoke --version
```

It is a path dependency, so any package manager installs it. In a workspace the
CLI belongs to the root rather than to a member package, or the skills and hooks
resolve against the wrong tree:

```sh
pnpm add -D -w /path/to/wikipoke
yarn add --dev /path/to/wikipoke
```

When developing Wikipoke itself, build the CLI directly. `build` clears `dist`
before compiling, so a removed or renamed module leaves no stale output, and
marks `dist/cli.js` executable. That last step matters: a project installed by
path symlinks that exact file, so a rebuild that left it non-executable would
silently demote every consumer's `node_modules/.bin/wikipoke` to the `npx`
fallback, and the notifier would stop refreshing the signal.

```sh
npm install
npm run build
node /path/to/wikipoke/dist/cli.js --help
```

Only the maintenance process needs Node and Git. Repositories may keep the
wiki as Markdown without installing it for ordinary readers.

Check the environment at any point, with or without a wiki. `doctor` reports
Node, Git, whether the root is a usable repository, the configuration and wiki
paths, whether a `post-commit` hook composes the notifier, pending work, and a
`problems` list:

```sh
npx --no-install wikipoke --root /work/acme doctor
```

## Initialize a project

`init` requires the root to be a Git repository with at least one commit, and
writes nothing otherwise. Choose meaningful source paths. Do not include
secrets, lockfiles, generated output, or the wiki itself. Start narrow:

```sh
npx --no-install wikipoke --root /work/acme init \
  --include 'src/**' 'packages/*/src/**' \
  --exclude '**/*.test.ts' 'dist/**' \
  --batch-files 10 \
  --batch-bytes 65536 \
  --language en
```

This writes `wikipoke.config.yaml`, `wiki/index.md`, and `.wikipoke/state.json`.
`--batch-files` sets `limits.batchFiles`, the number of undocumented sources a
single `ingest` plan may return; it defaults to 10. `--batch-bytes` sets
`limits.batchBytes`, the source weight one plan may carry, defaulting to 64 KiB.
Both bound the plan, and the byte budget is the one that matters on a repository
with large modules: ten files of a UI catalog outweigh an agent's context, and an
agent that truncates the plan loses the pinned evidence the patch has to carry.
A single source larger than the budget is still planned on its own, so an
oversized file never blocks the queue behind it. When a root-level
`.wikipokeignore` exists, initialization imports its non-comment glob patterns
into `exclude`. Review `include`, `exclude`, and limits before ingestion. The
CLI is deterministic: it plans work, validates evidence and commits safe wiki
writes. The installed agent skill reads the plan, reasons over code, and calls
the CLI to publish its result.

Check deterministic health before asking an agent to work:

```sh
npx --no-install wikipoke --root /work/acme status
npx --no-install wikipoke --root /work/acme lint
```

`status` lists uncovered sources, changed evidence, source that moved with no
decision behind it, incomplete task capture, and pending work. `lint` validates page structure and graph integrity without an
LLM. Both take the writer lock, as does `graph`, so run one Wikipoke command at
a time against a repository; a second concurrent command fails with a lock
error. If a process dies while holding the lock, inspect the repository, then:

```sh
npx --no-install wikipoke --root /work/acme recover --unlock
```

It reports the recorded owner — the PID and timestamp of the process that took
the lock — and whether a lock was actually released.

## Install agent entry points

```sh
npx --no-install wikipoke --root /work/acme install
```

The installer writes agent-neutral skills under `.agents/skills/` and a no-LLM
notifier at `.wikipoke/hooks/post-commit`. When no `post-commit` hook exists,
it installs a small delegating hook in Git's configured hook directory; that
delegator resolves the repository root at run time rather than embedding an
absolute path. It never replaces an existing hook or hook manager; in that case
it reports the composition step instead. `doctor` reports whether the notifier
is active.

`install` also writes `.wikipoke/hooks/session-start`, which refreshes the signal
and prints one line when the wiki owes work. Commits keep the signal fresh; this
puts it in front of the agent. Wikipoke composes it into `.claude/settings.json`
only when that file does not exist, and never rewrites one it finds; for Claude
Code, Codex, OpenCode and Cursor it reports the manual step instead. The README
section "Brief the agent at session start" carries the snippet for each.

Re-run `install` after an upgrade. It updates only files bearing its managed
marker and reports foreign files it leaves unchanged.

To remove the integration without losing knowledge:

```sh
npx --no-install wikipoke --root /work/acme uninstall
```

`uninstall` deletes only what `install` created, and reports what it removed,
what it preserved, and what needs a manual step. It keeps the wiki directory,
`wikipoke.config.yaml`, `.wikipoke/state.json`, events, releases, the attention
signal, and any hook or skill file it did not write.

## Bootstrap and maintain

Run the initial deterministic work plan:

```sh
npx --no-install wikipoke --root /work/acme ingest
```

It returns undocumented sources in bounded batches — at most `limits.batchFiles`
and `limits.batchBytes` per pass — plus related wiki context and a catalog of existing pages. The agent
researches that material and publishes a validated patch. Source or wiki changes
before publication produce a conflict rather than overwriting work; a patch that
declares the `revision` it was planned against is refused outright once the
sources have moved.

Automatic maintenance is a deterministic attention signal:

```sh
npx --no-install wikipoke --root /work/acme maintain --once
```

`maintain --once` recomputes health and writes `.wikipoke/attention.json`
itself. The signal is compact by design: revision, checkpoint, page count,
finding counts by severity, and a count plus a bounded sample for drift,
uncovered sources, and incomplete tasks. Use `status` when the full report is
needed. The installed `post-commit` notifier runs exactly this command, so
commits refresh the signal; use the project's scheduler for the same command
when commits are not the trigger you want. Wikipoke does not install a scheduler
or deploy a service.

When `status` has no uncovered sources, drift, or errors, seal the repository
checkpoint. The durable state is `.wikipoke/state.json`, outside editable wiki
pages, and records the last fully reconciled Git commit:

```sh
npx --no-install wikipoke --root /work/acme seal
```

`seal` refuses while any of the three remain and names the counts. It demands
total coverage of the configured scope, which is a high bar under a broad
`include`; keep the scope deliberately narrow if the checkpoint is meant to
advance regularly.

## Ask and retain questions

```sh
npx --no-install wikipoke --root /work/acme ask "How are payments validated?"
```

Wikipoke first creates a query record under `wiki/queries/`. A supplied
`--request-id` retries the same request; use a new ID for a separate invocation
of the same question. Use `--ref <commit>` for a historical code-source
question. The skill researches and writes the cited response through `wikipoke answer`.
Use `wikipoke schema answer` or `wikipoke schema patch` to obtain the exact
JSON contract before writing either payload; agents never need to inspect the
Wikipoke implementation to discover it.

`answer` requires cited evidence, or, when none exists, explicitly declared
`gaps`. An answer carried by gaps alone closes the query as `unsupported`, not
`answered`. Every attempt — pending, failed, answered, unsupported — is recorded
in `wikipoke.query.attempts` and rendered in the page body, so a rejected answer
leaves a trace instead of disappearing.

`answered` is terminal. A second `answer` on an answered query fails rather than
overwriting the recorded response; to revise it, open a new query with a
different `--request-id`, which produces a separate page. A `pending` or
`unsupported` query still accepts answers, so an unsupported one can be promoted
to `answered` once evidence exists, and a failed attempt in either state is
appended to `attempts` without erasing what is already written.

## Capture implementation decisions

Give each decision a short `title`: it names the page and the change-log entry.
Without one, the first sentence of the choice is used instead, which is derived
rather than chosen. Create event JSON outside the wiki or through an agent skill,
then persist it:

```sh
npx --no-install wikipoke --root /work/acme capture --event decision.json
```

Decision events materialize as decision pages and an entry in the generated
`wiki/log.md`. Wikipoke records absent rationale as unknown and never infers it
from a diff, which is why the `session-stop` hook asks for the reason during the
turn that made the change rather than in a later documentation pass. Open and
close task events make incomplete capture visible. See [operations](./operations.md)
for the event form.

## Capture a release

Commit wiki changes, then capture exact revisions:

```sh
git add wiki
git commit -m "docs: update wiki"
npx --no-install wikipoke --root /work/acme snapshot v1.0.0
git add .wikipoke/releases
git commit -m "docs: record wiki snapshot v1.0.0"
```

Snapshots retain code/wiki refs and the health report at capture time. No
command reads a snapshot back: to ask a historical question, pass the recorded
code commit to `ask --ref`, not the release label. Snapshots cannot make
external sources historically available when those source versions were not
retained.
