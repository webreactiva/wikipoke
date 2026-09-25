---
title: Architecture
type: architecture
responsibility: The map of wikipoke: who writes the wiki, who only measures it, and where the boundary between them is drawn.
sources:
  - src/bin/wikipoke.ts
  - src/lib/lib.ts
synced: 542edcd
---

Wikipoke is two products in one repository that never touch each other's job. The **skills** are
prose an agent follows to write Markdown pages; the **CLI** is a program that reads git and the
pages and reports what it finds, or shows them in a browser. The skills write and never measure by
hand; the CLI measures and shows, and never writes a page. Everything else here follows from that
split.

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
   src/bin/wikipoke.ts  ──►  src/lib/{drift,coverage,lint}.ts
            │                        └── src/lib/lib.ts (git, frontmatter, globs, pages)
            ├──►  src/atlas/{snapshot,serve,export}.ts  ──►  a browser, or a folder outside wiki/
            └──►  src/lib/install.ts  ──►  templates/**  (copied, never generated)
```

## The layers

**The templates are the product.** `templates/` holds the `SKILL.md` files, the
`CONVENTIONS.md` schema, the notifier and one file per hook. They are plain files copied
verbatim with `{{WIKI}}` substituted, never strings built in code — a rule the project states in
[AGENTS.md](../AGENTS.md) and which keeps the behaviour readable in the file that carries it. So
most of wikipoke's behaviour is not in `src/lib/`: it is in prose an agent reads. See
[the skill contract](concepts/skills-as-product.md).

**`src/lib/install.ts` is the only writer.** `init`, `hooks add|remove` and `uninstall` copy
templates into place, add and remove wikipoke's own entries inside files the project shares
(`.claude/settings.json`, `AGENTS.md`), and refuse to overwrite anything without the
`managed by wikipoke` marker. It is documented in [components/install.md](components/install.md)
and its ownership rule in [concepts/file-ownership.md](concepts/file-ownership.md).

**The three checks are read-only and deterministic.** `src/lib/drift.ts` answers "is the wiki
behind the code?", `src/lib/coverage.ts` "is all the code in the wiki?", and `src/lib/lint.ts` "is
the wiki internally sound?". They share `src/lib/lib.ts`, which is where git shells out,
frontmatter is parsed and globs are compiled. Each check exports the same `run(ctx)` /
`report(result, opts)` pair, and each returns a different shape.

Until `df4db0e` the CLI kept the three in one object and indexed it by name, which worked because
nothing had to know which shape came back. Under TypeScript that erases every result to the same
type, so the pair is now carried by a tagged union — one variant per check, discriminated by its
name (`src/bin/wikipoke.ts:39`) — and counting, printing and `--json` each narrow it back
(`src/bin/wikipoke.ts:291`). The uniform `run`/`report` contract is unchanged; what changed is that
the uniformity is no longer allowed to lose the result's shape.

**The atlas shows the wiki and writes only outside it.** `src/atlas/` gathers the pages, their
links and what `drift` says about each into one snapshot, and a browser page renders it — served
live on `127.0.0.1`, or exported with `--out` to a folder that must not be inside the wiki. It
borrows lint's link reading and drift's staleness rather than judging anything itself. It is the
reason `AGENTS.md` stopped saying "the CLI only measures" in `12ff4b8`: CLI code may now go to a
check or to atlas, and nowhere else. See [components/atlas.md](components/atlas.md).

**`src/bin/wikipoke.ts` is argument parsing and exit codes.** It resolves the repository root and
the wiki directory, dispatches, and decides what failure means: lint errors fail a plain run, while
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
| `src/bin/wikipoke.ts` | the CLI: `init`, `hooks`, `check`, `atlas`, `uninstall` |
| `src/lib/install.ts` | the installer: everything that writes outside `wiki/` |
| `src/lib/setup.ts` | `init` when a person is at the terminal: the questions, then `install.ts` |
| `src/lib/{drift,coverage,lint}.ts` | the three checks |
| `src/atlas/` | the atlas: the snapshot, the local server, the export, and the page in `web/` |
| `templates/skills/*/SKILL.md` | the skills: where the actual behaviour is |
| `templates/CONVENTIONS.md` | the page schema, copied into every wiki and then owned by it |

Node 22.18 or later, and no runtime dependencies: everything the CLI uses is in Node's standard
library, except two libraries that travel inside the package rather than being installed
alongside: marked, which the atlas's page loads, copied in by the build, and @clack/prompts, which
draws [the interactive `init`](decisions/interactive-init.md), bundled into `dist/lib/prompts.js`. Until `df4db0e` there was no build step either and the sources were `.mjs` under `bin/`
and `lib/`; they are now TypeScript under `src/`, read from source in development and shipped
compiled, for the reasons in
[decisions/typescript-two-ways.md](decisions/typescript-two-ways.md). `npm test` runs
`node --test test/*.test.ts`.
