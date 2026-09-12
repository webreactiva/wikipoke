---
title: Architecture
type: architecture
responsibility: The map of wikipoke: who writes the wiki, who only measures it, and where the boundary between them is drawn.
sources:
  - bin/wikipoke.mjs
  - lib/lib.mjs
synced: 68c8fa3
---

Wikipoke is two products in one repository that never touch each other's job. The **skills** are
prose an agent follows to write Markdown pages; the **CLI** is a program that reads git and the
pages and reports what it finds. The skills write and never measure by hand; the CLI measures and
never writes a page. Everything else here follows from that split.

```
         a person
            │  /wikipoke-ingest · /wikipoke-query · /wikipoke-lint
            ▼
   the agent, following templates/skills/*/SKILL.md
            │  writes Markdown
            ▼
      wiki/**  ── pages, index.md, log.md, .wikipoke-state.json
            ▲
            │  reads, never writes
   bin/wikipoke.mjs  ──►  lib/drift.mjs · lib/coverage.mjs · lib/lint.mjs
            │                        └── lib/lib.mjs (git, frontmatter, globs, pages)
            └──►  lib/install.mjs  ──►  templates/**  (copied, never generated)
```

## The layers

**The templates are the product.** `templates/` holds the three `SKILL.md` files, the
`CONVENTIONS.md` schema, the notifier and one file per hook. They are plain files copied
verbatim with `{{WIKI}}` substituted, never strings built in code — a rule the project states in
[AGENTS.md](../AGENTS.md) and which keeps the behaviour readable in the file that carries it. So
most of wikipoke's behaviour is not in `lib/`: it is in prose an agent reads. See
[the skill contract](concepts/skills-as-product.md).

**`lib/install.mjs` is the only writer.** `init`, `hooks add|remove` and `uninstall` copy
templates into place, add and remove wikipoke's own entries inside files the project shares
(`.claude/settings.json`, `AGENTS.md`), and refuse to overwrite anything without the
`managed by wikipoke` marker. It is documented in [components/install.md](components/install.md)
and its ownership rule in [concepts/file-ownership.md](concepts/file-ownership.md).

**The three checks are read-only and deterministic.** `lib/drift.mjs` answers "is the wiki behind
the code?", `lib/coverage.mjs` "is all the code in the wiki?", and `lib/lint.mjs` "is the wiki
internally sound?". They share `lib/lib.mjs`, which is where git shells out, frontmatter is parsed
and globs are compiled. Each check exports the same `run(ctx)` / `report(result, opts)` pair, which
is what lets `bin/wikipoke.mjs` treat them as a table rather than three special cases
(`bin/wikipoke.mjs:23`).

**`bin/wikipoke.mjs` is argument parsing and exit codes.** It resolves the repository root and the
wiki directory, dispatches, and decides what failure means: lint errors fail a plain run, while
staleness and coverage — which are debt, not breakage — do not. `--strict` makes every finding
fail, for CI. See [flows/check.md](flows/check.md).

## Where the state lives

There is almost none. `.wikipoke.json` at the repository root exists only when the wiki was moved
off `wiki/`, and holds one key. Inside the wiki, `.wikipoke-state.json` holds the repository
checkpoint and `.wikipokeignore` the coverage exclusions; both belong to the project. Everything
else a check needs it derives from git at the moment it runs, so there is no cache to invalidate
and no lock to hold. [concepts/two-axes-of-staleness.md](concepts/two-axes-of-staleness.md)
explains the one piece of state that does matter: the checkpoint and each page's `synced:`.

## Entry points

| Path | What it is |
| --- | --- |
| `bin/wikipoke.mjs` | the CLI: `init`, `hooks`, `check`, `uninstall` |
| `lib/install.mjs` | the installer: everything that writes outside `wiki/` |
| `lib/{drift,coverage,lint}.mjs` | the three checks |
| `templates/skills/*/SKILL.md` | the three skills: where the actual behaviour is |
| `templates/CONVENTIONS.md` | the page schema, copied into every wiki and then owned by it |

Node 22 or later, no dependencies, no build step. `npm test` runs `node --test test/*.test.mjs`.
