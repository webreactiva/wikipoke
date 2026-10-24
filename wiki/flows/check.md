---
title: A check run, end to end
type: flow
responsibility: What happens between typing `wikipoke check` and the exit code, across the CLI and the three checks.
sources:
  - src/bin/wikipoke.ts
  - src/lib/drift.ts
  - src/lib/coverage.ts
  - src/lib/lint.ts
synced: 9305eff
sources_key: da46634c4471
generated: { by: claude-code/claude-haiku-5-5, at: 2026-10-15T11:39:03Z }
verified: { by: claude-code/claude-opus-5-5, at: 2026-10-24T18:03:31Z }
trigger: a person, CI, or the notifier a hook runs
related:
  - ../components/checks.md
  - ../components/cli.md
---

```
wikipoke check [names…] [--json] [--strict] [-v] [--against <ref>]
     │
     ├─ repoRoot()      git rev-parse --show-toplevel   → exit 2 if not a repository
     ├─ wikiDir(root)   .wikipoke.json, else "wiki"
     ├─ --against <ref>?          → exit 2 unless drift is among the checks and the ref is a commit here
     ├─ no CONVENTIONS.md?        → "run wikipoke init first", exit 1   (not for drift --against alone)
     ├─ no state and no pages?    → "unseeded" (+ pending notes), exit 0   (only on a plain run)
     │
     ├─ for each named check: runCheck(name, { root, wikiDir, wiki })  → { name, result }
     │       drift    ── git rev-list / git diff       → { repo, pending[], stale[], skipped[], fresh[], moved[] }
     │                   └ wiki/.inbox/*.md, counted, never read → pending[]   (none under --against)
     │                   └ per page: git blame + git diff -U0 → citations[] (stale) · moved[] (fresh)
     │                   └ synced commit gone, sources_key present → judged by content, no files[]
     │                   └ --against: pages, checkpoint, .wikipokeignore and code all read from the ref
     │       coverage ── git ls-files + sources globs  → { unclaimed[], clusters[] }
     │       lint     ── read every page               → { errors[], warnings[] }
     │
     ├─ total = Σ countFindings(ran)
     │
     ├─ --json ? print the raw result(s)
     │   else  ? all three and nothing found ? one green line
     │           else ? each check that found something reports itself
     │           lint ran, not --json ? last deep pass line (information, counted nowhere)
     │
     └─ exit: --strict ? total minus the squash warnings : lint errors

wikipoke key [<page>...]   its own branch: hashes each page's sources, prints one key per page, writes nothing
```

Every answer is recomputed from git on the spot — there is no cache, no lock and no staging area,
so two runs of `check` can disagree only because the repository changed between them. The
persisted state a check reads is the checkpoint in `.wikipoke-state.json`, the wiki pages,
`.wikipokeignore`, and `log.md` for the deep pass line. Under `--against <ref>` drift reads the
first four from that commit instead (`0da6c99`, `b8ce2d1`).

## What the silences mean

The report functions of `drift` and `coverage` print **nothing** when there is nothing to say.
For drift that is what [the notifier depends on](../components/hooks.md): a hook that speaks on
every commit gets muted by the person within a week. Coverage's silence is rarer — a wiki seeded
honestly always has a backlog — which is why the notifier stopped running it in `aafa306`. `lint` is the exception — it prints `✓ lint: OK` when run
by name, because a person who asked for a review deserves an answer.

The green one-liner only appears for a plain `wikipoke check` with no findings at all, so
"current, covered and sound" is never claimed on the strength of one check out of three.

`--strict` fails on every finding except the squash warning. A squash or rebase merge leaves that
warning on re-stamped pages, and the merge style, not the wiki, made it, so a CI run must not fail
the branch that merged (`287f3c4`). The deep pass line is information too: it counts for nothing,
under `--strict` or not (`7c0a39c`).

## Why the order of exits matters

Two guards run before any check does. A missing `CONVENTIONS.md` means the wiki was never set up,
which is an installation problem, not a wiki problem: exit 1 with the fix. A wiki with no
checkpoint and no pages means the first ingest has not happened, which is not a failure at all: say
`unseeded` and exit 0 — naming, since `35f9c8a`, any decision notes already in the inbox, since
the seed is what will drain them. Without that second guard, a fresh `init` would report a missing `index.md`,
a missing `log.md` and a missing checkpoint as three errors, and the first thing a new user would
see is a red wiki they did nothing wrong to get.

A check named explicitly skips that guard on purpose: seeding starts by running
`wikipoke check coverage` to decide what belongs in `.wikipokeignore`, and that has to work on an
empty wiki. `--against` skips it too, because the wiki it reads is the ref's, not this checkout's.

## `--json`, and who reads it

`--json` prints one check's result object, or a map of them when several ran. It exists for the
skills: `wikipoke-ingest` reads `check drift --json` to get `repo` and `stale[]`, reads only those
pages' diffs, and re-points the citations in each stale page's `citations[]` and in `moved[]`
before it re-stamps `synced:`. That is the whole integration surface between the CLI and the skills —
the CLI hands over measurements, and the agent decides what to write. Each stale page also says
`by`: `synced` when its commit compares, `sources_key` when that commit is gone and only the content
can answer (`942d6a6`). Since `35f9c8a` it also
reads `pending[]`, the decision notes waiting in `wiki/.inbox/`, and drains them into decision pages
before anything else; they count as one finding for `--strict` and never fail a plain run
([why](../decisions/capture-decisions.md)).

Because the skills read it through a pipe, the run ends by setting the exit code and letting stdout
drain (`src/bin/wikipoke.ts:431`). It used to call `process.exit`, which drops what a pipe has not
taken yet: on a 1,480-file repository `check coverage --json` is about 75 KB, and every agent that
piped it into `jq` or `python3` got the first 64 KB and a parse error (`c82a188`).
