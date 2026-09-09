# User guide

## Install and start

Install the local package in the repository that will own the wiki — the
repository must already be a Git repository with at least one commit — then
choose a narrow source scope:

```sh
npm install --save-dev /path/to/wikipoke   # or pnpm add -D -w, or yarn add --dev
npx --no-install wikipoke init --include 'src/**' --exclude '**/*.test.ts' --batch-files 10 --batch-bytes 65536
npx --no-install wikipoke install
```

`init` creates `wikipoke.config.yaml`, `wiki/index.md`, and `.wikipoke/state.json`.
It refuses to overwrite an existing wiki index. Put reusable source exclusions in
`.wikipokeignore` before initialization. `--batch-files` caps how many
undocumented sources one `ingest` pass plans, and `--batch-bytes` caps how much
source it may weigh, so a plan stays readable whole instead of being truncated.

Run `wikipoke doctor` at any time, before or after initialization, to see Node,
Git, repository, configuration, hook status, pending work, and problems.

Run one Wikipoke command at a time per repository. Reads share the writer lock,
so a second concurrent command fails; `wikipoke recover --unlock` releases a
lock left by a dead process and names its owner.

## Add knowledge

Run the installed `wikipoke-ingest` skill. It runs `wikipoke ingest`, reads the
bounded source plan and related pages, obtains `wikipoke schema patch`, and
publishes an agent-authored patch with `wikipoke publish --patch patch.json`.

Wikipoke verifies source IDs, revisions, hashes, paths, graph integrity, page
identity, and concurrent edits before it publishes anything. A patch may carry
the `revision` its plan was built on; if the sources moved in the meantime the
patch is rejected and the plan has to be redone. Source text never reaches a
page: only the source id, resource, revision, and hash are stored.

`publish` creates and replaces pages. It cannot delete a page or mark one
obsolete — that stays a manual Git edit.

## Ask a question

Run the installed `wikipoke-query` skill, or use its commands directly:

```sh
wikipoke ask "How are payments validated?" --request-id payments-validation
wikipoke schema answer
wikipoke answer --request-id payments-validation --response answer.json
```

`ask` creates a pending page under `wiki/queries/`. The agent researches
suggested wiki pages and source code; `answer` closes the record only when every
citation is known at the requested Git revision. With no citations it requires
declared `gaps` instead, and the query closes as `unsupported`. Failed attempts
stay recorded on the page, so a rejected answer is visible rather than lost.

An `unsupported` query can still be answered later, and is promoted to
`answered` once cited evidence exists. `answered` is final: answering it again
fails instead of overwriting the response. Revise a closed answer by asking
again with a different `--request-id`, which opens a separate query page.

For a historical question, pass a commit: `wikipoke ask "..." --ref <commit>`.

## Record implementation decisions

A question already answered comes back instead of being researched again: when
the same question — compared on its letters and digits, so punctuation does not
matter — is already `answered` against sources that have not moved, `ask` returns
that answer with `reused: true` and writes no page. `--again` overrides it, and a
cited source that has since changed disables the reuse on its own.

Run `wikipoke-decision` whenever a material implementation choice is made and
before task closure:

```sh
wikipoke capture --event decision.json
```

Decision events create pages in `wiki/decisions/` and an entry in the generated
`wiki/log.md`. The event tape itself stays in `.wikipoke/events/` and is never
transcribed into a page: a task's open and close events are process, not
knowledge. Open and close events make incomplete capture visible in
`wikipoke status`.

Nothing asks for a decision. Wikipoke records one when an agent has one and never
nags for one it does not: a reason invented to satisfy a reminder is worse than a
recorded absence. If your project wants to be asked — at the end of a turn, before
a release, wherever it makes sense — attach a script of your own; see
[extensions](./extensions.md).

## Maintain and release

The post-commit hook runs `wikipoke maintain --once`, which refreshes
`.wikipoke/attention.json`. It never calls a model and never blocks a commit; if
the CLI cannot be resolved it exits silently and the previous signal stands.
Inspect that signal — counts and bounded samples — or run `wikipoke status` for
the full report at the next agent session, then use `wikipoke-ingest` when work
is pending.

When every included source is covered and lint is clean, run `wikipoke seal` to
record the Git checkpoint. Full coverage is a demanding bar under a broad
`include`, so scope deliberately. For a release, commit wiki content, run
`wikipoke snapshot v1.0.0`, then commit `.wikipoke/releases/`; nothing reads a
snapshot back, so keep the recorded commit if you intend to query that state
later.

To step back out, `wikipoke uninstall` removes the skills and hooks it installed
and preserves the wiki, configuration, events, and releases.

See [the knowledge format](./format.md) for page structure and
[operations](./operations.md) for the event payload.
