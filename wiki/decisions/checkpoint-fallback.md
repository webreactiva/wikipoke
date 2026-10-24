---
title: A lost checkpoint is stood in for by the commit that wrote it
type: decision
responsibility: Why, after a squash or rebase merge, drift counts from the last commit that wrote the checkpoint instead of reporting the wiki broken, when it refuses to, and why `--strict` does not fail on the warnings the merge leaves.
sources:
  - src/lib/drift.ts
  - src/lib/lint.ts
  - src/bin/wikipoke.ts
  - templates/skills/wikipoke-ingest/SKILL.md
synced: 9305eff
verified: { by: claude-code/claude-opus-5-5, at: 2026-10-24T18:03:31Z }
sources_key: 8064f6c2974f
reversible: false
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-16T07:28:36Z }
related:
  - ./content-key.md
  - ../components/checks.md
  - ../concepts/two-axes-of-staleness.md
  - ../flows/ingest-pass.md
---

When the checkpoint, `last_indexed_commit` in `.wikipoke-state.json`, names a commit that is not
here, drift looks for the newest commit on the ref that touched that file. It counts from that
commit only if the file there names this same checkpoint (`src/lib/drift.ts:325`). After a squash,
that commit is the squash itself. `--json` reports it as `repo.fallback`. Decided in #31 and
carried out in `287f3c4` and `5054844` (PR #39).

## Why

[The content key](./content-key.md) kept pages judgeable after a squash, but the checkpoint had
the same problem and no fix. A pass on a branch stamps a branch commit there, so after a squash
drift reported the whole wiki **broken**. The CI recipe the README gives,
`wikipoke check --against origin/main --strict`, then stayed red on main until someone ran a pass
on main itself. Nothing was broken: the code had moved past a point the merge had renamed.

## What was set aside, and why

- **Reporting `behind` instead of `broken`.** Simpler, but it would read every lost checkpoint as
  debt, a typo included, and give no point to count from.
- **Matching the wiki's content to find a commit.** Heavier, and the commit that wrote the
  checkpoint already answers the question.
- **Counting from the fallback's parent.** Every squash would then read `behind` and fail
  `--strict` again. Counting from the fallback itself costs the known limit below.
- **Only a recovery step in the skill, or dropping `--strict` from the recipe.** That would keep
  CI red, or blind, until someone acted.

## What it constrains

- Only a commit that wrote this very checkpoint stands in for it, so a typo nobody committed stays
  broken. A wrong sha that was committed cannot be told from a squash, and takes the fallback.
- A shallow clone never takes it (`src/lib/drift.ts:320`): its grafted root "wrote" every file. It
  stays broken, with a hint to fetch the full history (`fetch-depth: 0`).
- `--strict` fails on every finding except lint's `squash: true` warnings
  (`src/bin/wikipoke.ts:393`, `src/lib/lint.ts:43`), which only the merge style made. `behind`
  still fails it.
- The line about the fallback prints only next to a `behind` line, so a current wiki keeps the
  notifier silent.
- When `repo` carries `fallback`, the ingest skill never "says so and stops". It re-reads and
  re-stamps the pages flagged `squash`, and seals the checkpoint
  (`templates/skills/wikipoke-ingest/SKILL.md:225`).
- Known limit: after a squash, code committed on the branch after its last pass reads as indexed,
  because the squash folds it into the fallback commit. A page with `sources_key:` still catches
  its own sources changing. A rebase merge does not have this problem.
- With the wiki at the repository root the state path starts with `/`, the fallback finds no
  commit, and drift reports broken as before.
