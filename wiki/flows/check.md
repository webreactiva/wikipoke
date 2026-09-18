---
title: A check run, end to end
type: flow
responsibility: What happens between typing `wikipoke check` and the exit code, across the CLI and the three checks.
sources:
  - src/bin/wikipoke.ts
  - src/lib/drift.ts
  - src/lib/coverage.ts
  - src/lib/lint.ts
synced: 3eb714c
trigger: a person, CI, or the notifier a hook runs
related:
  - ../components/checks.md
  - ../components/cli.md
---

```
wikipoke check [names…] [--json] [--strict] [-v]
     │
     ├─ repoRoot()      git rev-parse --show-toplevel   → exit 2 if not a repository
     ├─ wikiDir(root)   .wikipoke.json, else "wiki"
     ├─ no CONVENTIONS.md?        → "run wikipoke init first", exit 1
     ├─ no state and no pages?    → "unseeded", exit 0          (only on a plain run)
     │
     ├─ for each named check: runCheck(name, { root, wikiDir, wiki })  → { name, result }
     │       drift    ── git rev-list / git diff       → { repo, stale[], skipped[], fresh[] }
     │                   └ per stale page: git diff -U0  → citations[] { raw, now }
     │       coverage ── git ls-files + sources globs  → { unclaimed[], clusters[] }
     │       lint     ── read every page               → { errors[], warnings[] }
     │
     ├─ total = Σ countFindings(ran)
     │
     └─ --json ? print the raw result(s)
        all three and nothing found ? one green line
        else ? each check that found something reports itself
                                                exit: --strict ? total : lint errors
```

Every answer is recomputed from git on the spot — there is no cache, no lock and no staging area,
so two runs of `check` can disagree only because the repository changed between them. The one
piece of persisted state a check reads is the checkpoint in `.wikipoke-state.json`, and the wiki
pages themselves.

## What the silences mean

The report functions of `drift` and `coverage` print **nothing** when there is nothing to say.
For drift that is what [the notifier depends on](../components/hooks.md): a hook that speaks on
every commit gets muted by the person within a week. Coverage's silence is rarer — a wiki seeded
honestly always has a backlog — which is why the notifier stopped running it in `aafa306`. `lint` is the exception — it prints `✓ lint: OK` when run
by name, because a person who asked for a review deserves an answer.

The green one-liner only appears for a plain `wikipoke check` with no findings at all, so
"current, covered and sound" is never claimed on the strength of one check out of three.

## Why the order of exits matters

Two guards run before any check does. A missing `CONVENTIONS.md` means the wiki was never set up,
which is an installation problem, not a wiki problem: exit 1 with the fix. A wiki with no
checkpoint and no pages means the first ingest has not happened, which is not a failure at all: say
`unseeded` and exit 0. Without that second guard, a fresh `init` would report a missing `index.md`,
a missing `log.md` and a missing checkpoint as three errors, and the first thing a new user would
see is a red wiki they did nothing wrong to get.

A check named explicitly skips that guard on purpose: seeding starts by running
`wikipoke check coverage` to decide what belongs in `.wikipokeignore`, and that has to work on an
empty wiki.

## `--json`, and who reads it

`--json` prints one check's result object, or a map of them when several ran. It exists for the
skills: `wikipoke-ingest` reads `check drift --json` to get `repo` and `stale[]`, reads only those
pages' diffs, and re-points each stale page's `citations[]` before it re-stamps `synced:`. That is the whole integration surface between the CLI and the skills —
the CLI hands over measurements, and the agent decides what to write.
