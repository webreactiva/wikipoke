# Installation and operation

Wikipoke maintains an evidence-led, editable wiki. Source code remains the
authority for documented behavior; the wiki is not a replacement for source
control or review.

## Install the CLI

Wikipoke requires Node 22 or later and Git for its code-source adapter. Until a
registry release exists, add the local checkout to each maintained project so
agent skills and hooks can find the CLI without downloading anything at runtime:

```sh
npm install --save-dev /path/to/wikipoke
npx --no-install wikipoke --help
```

When developing Wikipoke itself, build the CLI directly:

```sh
npm install
npm run build
node /path/to/wikipoke/dist/cli.js --help
```

Only the maintenance process needs Node and Git. Repositories may keep the
wiki as Markdown without installing it for ordinary readers.

## Initialize a project

Choose meaningful source paths. Do not include secrets, lockfiles, generated
output, or the wiki itself. Start narrow:

```sh
npx --no-install wikipoke --root /work/acme init \
  --include 'src/**' 'packages/*/src/**' \
  --exclude '**/*.test.ts' 'dist/**' \
  --language en
```

This writes `wikipoke.config.yaml` and `wiki/index.md`. When a root-level
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

`status` lists uncovered sources, changed evidence, incomplete task capture, and
pending work. `lint` validates page structure and graph integrity without an
LLM.

## Install agent entry points

```sh
npx --no-install wikipoke --root /work/acme install
```

The installer writes agent-neutral skills under `.agents/skills/` and a no-LLM
notifier at `.wikipoke/hooks/post-commit`. When no `post-commit` hook exists,
it installs a small delegating hook in Git's configured hook directory. It
never replaces an existing hook or hook manager; in that case it reports the
composition step instead. `doctor` reports whether the notifier is active.

Re-run `install` after an upgrade. It updates only files bearing its managed
marker and reports foreign files it leaves unchanged.

## Bootstrap and maintain

Run the initial deterministic work plan:

```sh
npx --no-install wikipoke --root /work/acme ingest
```

It returns configured sources in bounded batches and related wiki context. The
agent researches that material and publishes a validated patch. Source or wiki
changes before publication produce a conflict rather than overwriting work.

Automatic maintenance is a deterministic attention signal. It still needs a
scheduler to invoke it:

```sh
npx --no-install wikipoke --root /work/acme maintain --once
```

Use the project's scheduler for that command. Wikipoke does not install a
scheduler or deploy a service. `doctor` reports configured capabilities.

When `status` has no uncovered sources, drift, or errors, seal the repository
checkpoint. The durable state is `.wikipoke/state.json`, outside editable wiki
pages, and records the last fully reconciled Git commit:

```sh
npx --no-install wikipoke --root /work/acme seal
```

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

## Capture implementation decisions

Create event JSON outside the wiki or through an agent skill, then persist it:

```sh
npx --no-install wikipoke --root /work/acme capture --event decision.json
```

Decision events materialize as watchlogs and decision pages. Wikipoke
records absent rationale as unknown and never infers it from a diff. Open and
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

Snapshots retain code/wiki refs and health. They cannot make external sources
historically available when those source versions were not retained.
