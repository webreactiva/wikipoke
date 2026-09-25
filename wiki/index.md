---
okf_version: "0.2"
---

# The wikipoke wiki

What this repository knows about itself. Start at
[architecture](./architecture.md); the schema every page follows is in
[CONVENTIONS.md](./CONVENTIONS.md).

## Architecture

- [architecture.md](./architecture.md) — the map of wikipoke: who writes the wiki, who only measures it, and where the boundary between them is drawn.

## Flows

- [flows/check.md](./flows/check.md) — what happens between typing `wikipoke check` and the exit code, across the CLI and the three checks.
- [flows/ingest-pass.md](./flows/ingest-pass.md) — the loop a person and an agent run to seed, reconcile or extend the wiki, and where the checkpoint moves.
- [flows/install.md](./flows/install.md) — what `wikipoke init` and `wikipoke hooks add` actually write, in what order, and what they refuse to touch.

## Components

- [components/cli.md](./components/cli.md) — how `src/bin/wikipoke.ts` dispatches the five commands and what each exit code means.
- [components/checks.md](./components/checks.md) — what drift, coverage and lint each decide, and why all three are deterministic and read-only.
- [components/lib.md](./components/lib.md) — the git, frontmatter, glob and page-listing helpers the three checks share, and the constraints each one encodes.
- [components/install.md](./components/install.md) — how init, hooks add/remove and uninstall write files without ever taking something the project owns.
- [components/hooks.md](./components/hooks.md) — the five optional hooks, the one notifier they all run, and why none of them can write the wiki.
- [components/atlas.md](./components/atlas.md) — how `wikipoke atlas` turns the wiki into one snapshot that a browser page renders, served live or exported as a static site, without ever writing in the wiki.
- [components/skills.md](./components/skills.md) — what each skill template instructs the agent to do, and the boundaries the three wiki skills share.

## Concepts

- [concepts/skills-as-product.md](./concepts/skills-as-product.md) — why most of wikipoke's behaviour lives in Markdown templates that no code ever reads.
- [concepts/two-axes-of-staleness.md](./concepts/two-axes-of-staleness.md) — why the wiki tracks both a repository checkpoint and a per-page `synced:`, and what each one catches that the other misses.
- [concepts/coverage-as-debt.md](./concepts/coverage-as-debt.md) — why uncovered code never fails a check, and what that buys.
- [concepts/over-broad-sources.md](./concepts/over-broad-sources.md) — how a too-wide `sources:` entry makes coverage lie, and what the check does about it.
- [concepts/file-ownership.md](./concepts/file-ownership.md) — the `managed by wikipoke` marker, and the three ownership rules every write goes through.
- [concepts/schema-lives-in-the-wiki.md](./concepts/schema-lives-in-the-wiki.md) — why CONVENTIONS.md, a file the project owns and edits, is the authority the checks read from.

## Decisions

- [decisions/cli-read-only.md](./decisions/cli-read-only.md) — why version 0.2 moved the writing out of the CLI and into the skills, and what was given up.
- [decisions/notify-never-write.md](./decisions/notify-never-write.md) — why no hook updates the wiki automatically, and why the notifier can never fail.
- [decisions/plain-markdown-links.md](./decisions/plain-markdown-links.md) — why the wiki uses `[text](./page.md)` and reports `[[term]]` instead of resolving it.
- [decisions/typescript-two-ways.md](./decisions/typescript-two-ways.md) — why the CLI runs from its TypeScript sources in development but ships compiled, and what that costs.
