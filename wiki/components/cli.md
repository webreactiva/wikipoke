---
title: The CLI entry point
type: entity
responsibility: How `bin/wikipoke.mjs` dispatches the four commands and what each exit code means.
sources:
  - bin/wikipoke.mjs
synced: 68c8fa3
related:
  - ../architecture.md
  - ../flows/check.md
---

A single file, no framework, `node:util`'s `parseArgs` and a handful of `if` blocks that each end
in `process.exit`. It resolves two things before anything else happens — the repository root and
the wiki directory (`bin/wikipoke.mjs:77`) — and hands both to whatever runs next, so no other
module has to find them again.

Four commands: `init`, `hooks`, `check`, `uninstall`. Only `check` has real logic here, and it is
mostly arithmetic on other people's results.

## The checks are a table, not three cases

`const CHECKS = { drift, coverage, lint }` (`bin/wikipoke.mjs:23`) is the whole extension point.
Each module exports `run(ctx)` and `report(result, opts)`, so naming a check on the command line,
running all three, and counting findings are the same three lines for any of them. A fourth check
is a fourth module with that pair plus a row in the table; nothing else in the file changes. The
`findings` map right below (`bin/wikipoke.mjs:181`) is the one place that knows what "a finding"
means per check, because each result has a different shape.

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
instead of reporting a missing checkpoint and missing index as errors (`bin/wikipoke.mjs:171`) —
there is nothing to be unsound about yet. And a check named explicitly still runs, because seeding
reads `coverage` to decide what to put in `.wikipokeignore`.

## `init` asks, unless nobody is there

`init` ends by listing the hooks and, **only when both stdin and stdout are a TTY**, asking which
to install (`bin/wikipoke.mjs:113`). Run by an agent or through a pipe there is nobody to answer,
so it installs none and prints the instruction for the agent to ask the person and then run
`wikipoke hooks add`. The hooks change what a person's terminal and other agents' sessions do, so
they are never a default. See [components/install.md](./install.md).
