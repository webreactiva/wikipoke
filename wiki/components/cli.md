---
title: The CLI entry point
type: entity
responsibility: How `src/bin/wikipoke.ts` dispatches the four commands and what each exit code means.
sources:
  - src/bin/wikipoke.ts
synced: df4db0e
related:
  - ../architecture.md
  - ../flows/check.md
---

A single file, no framework, `node:util`'s `parseArgs` and a handful of `if` blocks that each end
in `process.exit`. It resolves two things before anything else happens — the repository root and
the wiki directory (`src/bin/wikipoke.ts:95`) — and hands both to whatever runs next, so no other
module has to find them again.

Four commands: `init`, `hooks`, `check`, `uninstall`. Only `check` has real logic here, and it is
mostly arithmetic on other people's results.

## One contract, three shapes

Every check exports `run(ctx)` and `report(result, opts)`, so naming a check on the command line,
running all three and counting findings stay the same three steps whichever one it is. A fourth
check is a fourth module with that pair; the file grows by one variant and nothing else moves.

Until `df4db0e` that uniformity was literally an object, `const CHECKS = { drift, coverage, lint }`
indexed by name, and it worked because nothing downstream cared what came back. It does not survive
typing: indexing that object collapses three unrelated result types into their union, and every
later use has to be told which one it really got. So the results now travel tagged — `Ran`, one
variant per check, discriminated by its own name (`src/bin/wikipoke.ts:36`) — and `runCheck`,
`countFindings` and `reportOne` each narrow it back (`src/bin/wikipoke.ts:205`). `CHECKS` survives
as the list of valid names, which is all the argument parsing ever needed it for
(`src/bin/wikipoke.ts:28`).

The counting still lives here rather than in the checks: what "a finding" means differs per check
and only the exit code cares, so the knowledge sits next to the thing that uses it.

## Exit codes carry the philosophy

```
plain run   → exit 1 only when lint found errors      (a broken wiki)
--strict    → exit 1 on any finding at all            (CI)
bad usage   → exit 2                                  (unknown command, not a git repository)
```

Staleness and coverage never fail a plain run. That is not a convenience: it is the project's
position that [uncovered code is debt, not breakage](../concepts/coverage-as-debt.md), expressed
in the only place a script can read it.

Two more deliberate quiets. Before the first ingest, a plain `check` prints `unseeded` and exits 0
instead of reporting a missing checkpoint and missing index as errors (`src/bin/wikipoke.ts:191`) —
there is nothing to be unsound about yet. And a check named explicitly still runs, because seeding
reads `coverage` to decide what to put in `.wikipokeignore`.

## `init` asks, unless nobody is there

`init` ends by listing the hooks and, **only when both stdin and stdout are a TTY**, asking which
to install (`src/bin/wikipoke.ts:131`). Run by an agent or through a pipe there is nobody to answer,
so it installs none and prints the instruction for the agent to ask the person and then run
`wikipoke hooks add`. The hooks change what a person's terminal and other agents' sessions do, so
they are never a default.

That branch decides more than it looks like. A repository whose `init` was run by an agent — the
common case now — ends up with no notifier at all unless someone comes back and asks for one, and
this repository was one of them until `df4db0e`. See
[components/hooks.md](./hooks.md) for which of the five survive a clone and which cannot, and
[components/install.md](./install.md) for what each one writes.
