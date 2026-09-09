# User guide

## Install and start

Install the local package in the repository that will own the wiki, then choose a narrow source scope:

```sh
npm install --save-dev /path/to/wikipoke
npx --no-install wikipoke init --include 'src/**' --exclude '**/*.test.ts'
npx --no-install wikipoke install
```

`init` creates `wikipoke.config.yaml`, `wiki/index.md`, and `.wikipoke/state.json`. It refuses to overwrite an existing wiki index. Put reusable source exclusions in `.wikipokeignore` before initialization.

## Add knowledge

Run the installed `wikipoke-ingest` skill. It runs `wikipoke ingest`, reads the bounded source plan and related pages, obtains `wikipoke schema patch`, and publishes an agent-authored patch with `wikipoke publish --patch patch.json`.

Wikipoke verifies source IDs, revisions, hashes, paths, graph integrity, page identity, and concurrent edits before it publishes anything.

## Ask a question

Run the installed `wikipoke-query` skill, or use its commands directly:

```sh
wikipoke ask "How are payments validated?" --request-id payments-validation
wikipoke schema answer
wikipoke answer --request-id payments-validation --response answer.json
```

`ask` creates a pending page under `wiki/queries/`. The agent researches suggested wiki pages and source code; `answer` closes the record only when every citation is known at the requested Git revision.

## Record implementation decisions

Run `wikipoke-decision` whenever a material implementation choice is made and before task closure:

```sh
wikipoke capture --event decision.json
```

Decision events create pages in `wiki/decisions/`; task histories live in `wiki/watchlogs/`. Open and close events make incomplete capture visible in `wikipoke status`.

## Maintain and release

The post-commit hook writes `.wikipoke/attention.json`; it never calls a model or blocks a commit. Inspect that signal or run `wikipoke status` at the next agent session, then use `wikipoke-ingest` when work is pending.

When all included sources are covered and lint is clean, run `wikipoke seal` to record the Git checkpoint. For a release, commit wiki content, run `wikipoke snapshot v1.0.0`, then commit `.wikipoke/releases/`.
