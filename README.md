# Wikipoke

Wikipoke maintains an OKF-compatible Markdown wiki from versioned project
sources. It preserves questions and agent implementation choices as connected,
citable knowledge. Git is the first source adapter; agents remain responsible
for interpretation and use the CLI only for deterministic plans and writes.

## Install and initialize

Use Node 22 or later. Build the package, then initialize a project with an
explicit source scope. Do not use a broad glob until excluded/generated paths
are understood.

```sh
npm install
npm run build
node dist/cli.js --root /path/to/project init --include 'src/**'
node dist/cli.js --root /path/to/project install
```

Scheduled `wikipoke maintain --once` refreshes the deterministic attention
signal; it does not replace existing Git hooks.
`install` writes agent-neutral skills under `.agents/skills/` and a hook at
`.wikipoke/hooks/post-commit`. Compose that hook with the project's existing
hook manager. It only notifies and never invokes a model or blocks a commit.

## Operations

```sh
wikipoke status
wikipoke ingest
wikipoke ask "How are payments validated?" --request-id payment-validation
wikipoke answer --request-id payment-validation --response answer.json
wikipoke publish --patch patch.json
wikipoke capture --event decision.json
wikipoke snapshot v1.0.0
wikipoke lint
wikipoke graph
```

Read the full [installation and operation guide](docs/installation.md) for
configuration, scheduling, hooks, queries, task events, and release captures.
Use the [user guide](docs/user-guide.md) for everyday workflows and the
[architecture guide](docs/architecture.md) for skills, hooks, CLI boundaries,
state, and integration behavior.

`ask` creates a durable query page before the agent researches it; `answer`
validates citations before closing it. `capture` accepts a task event with an ID, task, actor, ISO
timestamp, and `open`, `decision`, or `close` kind. A decision requires `choice`;
a `none_declared` closure requires a rationale. See [operations](docs/operations.md).

## Agent workflow

`ingest` returns a bounded source plan and related wiki context. An installed
agent skill reads that material, reasons in its own native flow, and sends a
structured patch to `publish`. No provider-specific CLI is part of Wikipoke.

## Safety and limits

The library rejects out-of-scope paths, symlink traversal in the wiki, unpinned
source evidence, unknown citations, duplicate event identities, and concurrent
edits. File publication uses a recovery journal. A snapshot requires committed
wiki content and retains exact Git refs for code and wiki. It does not archive
external source revisions automatically.
