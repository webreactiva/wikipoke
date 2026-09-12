---
title: The CLI entry point
type: entity
responsibility: How `src/bin/wikipoke.ts` dispatches the four commands and what each exit code means.
sources:
  - src/bin/wikipoke.ts
synced: 08177b5
related:
  - ../architecture.md
  - ../flows/check.md
---

A single file, no framework, `node:util`'s `parseArgs` and a handful of `if` blocks that each end
in `process.exit`. It resolves two things before anything else happens — the repository root and
the wiki directory (`src/bin/wikipoke.ts:94`) — and hands both to whatever runs next, so no other
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
`countFindings` and `reportOne` each narrow it back (`src/bin/wikipoke.ts:234`). `CHECKS` survives
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
instead of reporting a missing checkpoint and missing index as errors (`src/bin/wikipoke.ts:220`) —
there is nothing to be unsound about yet. And a check named explicitly still runs, because seeding
reads `coverage` to decide what to put in `.wikipokeignore`.

## `init` asks, and when it cannot ask it invites

`init` ends by listing the hooks and, **only when both stdin and stdout are a TTY**, asking which
to install (`src/bin/wikipoke.ts:156`). Run by an agent or through a pipe there is nobody to
answer, so it installs none: a hook changes what a person's terminal and other agents' sessions do,
and that is theirs to agree to.

Until `08177b5` the other branch printed one line — *"ask the person which they want"* — and left.
That is how this repository ran for three commits with no notifier at all and did not notice, which
is the exact failure the notifier exists to prevent. The branch now prints a real invitation
(`src/bin/wikipoke.ts:124`): what is missing, that without a hook nothing will ever say the wiki is
stale because `check` speaks only when run, and the command. It is addressed to the agent on
purpose — the CLI cannot see whether it is being run by Claude Code or OpenCode, and the agent
knows, so the choice is handed to the party that can make it rather than guessed at here. Bare
`wikipoke hooks` says the same whenever nothing is installed, and goes quiet once something is.

The line this draws is not about hooks alone: see
[what may be written unasked](../concepts/file-ownership.md), which is why the skills need no such
ceremony. [components/hooks.md](./hooks.md) has which of the five survive a clone.
