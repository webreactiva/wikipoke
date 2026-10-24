---
title: A page also remembers what its code hashed to
type: decision
responsibility: Why every page carries a content key, `sources_key:`, beside the commit it was checked against, rather than in place of it, and why the CLI prints the key instead of writing it.
sources:
  - src/lib/lib.ts
  - src/lib/drift.ts
  - src/lib/lint.ts
  - src/bin/wikipoke.ts
  - templates/CONVENTIONS.md
synced: 9305eff
verified: { by: claude-code/claude-opus-5-5, at: 2026-10-24T18:03:31Z }
sources_key: 21c941f56fb9
reversible: false
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-16T07:28:36Z }
related:
  - ./checkpoint-fallback.md
  - ../components/lib.md
  - ../components/checks.md
  - ../concepts/two-axes-of-staleness.md
  - ./cli-read-only.md
---

Every page keeps two answers to "is this page still true?". `synced:` names the commit the page
was checked against; `sources_key:` holds what the page's sources hashed to at that moment: the
first twelve hex characters of a hash over each matched path and its git blob id
(`src/lib/lib.ts:297`, `KEY_LENGTH` at `src/lib/lib.ts:177`). Drift reads the key only when
`synced:` is not a commit here (`src/lib/drift.ts:179`), which is what a squash or rebase merge
leaves behind. Decided in #3 and carried out in `942d6a6` (PR #22).

## Why

A wiki pass usually runs on a branch, so `synced:` names a branch commit. Squash and rebase merges
throw those commits away. On a fresh clone of main, every page of that pass pointed at a commit
that did not exist: drift skipped it as `unknown sha`, and lint failed with exit 1. One merge made
the wiki unjudgeable and failed the check that is meant to fail only on a broken wiki. How a team
merges is not the wiki's business, so staleness had to stop depending on it. A content key needs
no history: the same files give the same key on any clone and any branch.

## What was set aside, and why

- **Replacing `synced:` with the key.** The key knows *that* the sources moved, never *which*,
  and it cannot carry a `path:line` citation through a diff. `synced:` stays the primary clock,
  and the key is the fallback. A page judged by its key is stale or fresh with empty `files[]` and
  `citations[]`, and `--json` says so with `"by": "sources_key"`.
- **Counting commits.** A commit distance cannot see a change that was later reverted. A content
  key does, because the reverted files hash to the old key again and the page reads fresh.
- **One key per source.** It would tell which source moved, but drift already lists the files when
  `synced:` answers, and per page costs one frontmatter line.
- **The agent computing the key.** An agent must never type a hash. The skills copy it from
  `wikipoke key <page>` (`src/bin/wikipoke.ts:297`), which prints it and writes nothing, so the
  CLI stays [read-only](./cli-read-only.md).

## What it constrains

- `synced:` and `sources_key:` move together, and only after the page is re-read against the code.
  A lint fix that does not re-read touches neither (`templates/CONVENTIONS.md:178`).
- Only a key of the exact shape answers (`KEY_SHAPE`, `src/lib/lib.ts:180`). A typo would never
  match, pinning the page as stale for good, so drift skips it (`src/lib/drift.ts:184`) and lint
  names it.
- Lint softens "`synced` is not a commit" from an error to a warning marked `squash` only while a
  well-formed key answers (`src/lib/lint.ts:137`).
- The key is optional. A page without one is checked as before, so wikis written before 0.4 keep
  working, but such a page is unjudgeable after a squash.

The same merge also throws away the repository checkpoint, which no page key covers; that is
[the checkpoint fallback](./checkpoint-fallback.md).
