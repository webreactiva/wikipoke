---
title: TypeScript read two ways
type: decision
responsibility: Why the CLI runs from its TypeScript sources in development but ships compiled, and what that costs.
sources:
  - tsconfig.json
  - tsconfig.build.json
  - package.json
  - scripts/build.ts
  - src/atlas/web/tsconfig.json
synced: f4615f9
---

Node 22.18 runs a `.ts` file by stripping the types out of it and executing what is left. That is
the whole reason this project could take TypeScript at all: wikipoke's pitch is a CLI with no
dependencies and, until `df4db0e`, no build step, and a conversion that put `tsc` between a
contributor and running the thing would have spent most of what the tool is worth.

So the sources are read two ways. `npm test` runs `node --test test/*.test.ts` against `src/`
directly (`package.json:39`): no build, and the test exercises the same bytes the contributor just
edited rather than an artefact derived from them. What ships is compiled, because Node **refuses**
to strip types under `node_modules/` — it throws `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` —
and `npm install -D wikipoke`, the local dependency the README documents, puts wikipoke exactly
there. `prepare` runs the build on install (`package.json:40`) and `bin` points at
`dist/bin/wikipoke.js` (`package.json:26`).

## What was given up, and what was refused

The alternative was to ship the `.ts` files and let Node strip them at run time everywhere. It is
simpler, keeps "no build step" literally true, and works for a global install — but it breaks the
local-dependency install outright, so it was never really on the table once the node_modules rule
was checked rather than assumed.

The real cost of compiling is that `dist/` is generated and generated files lose things. The
executable bit is the one that bit first: `tsc` emits mode 644, the notifier tests its CLI with
`[ -x node_modules/.bin/wikipoke ]`, and the hook went quiet without failing. npm sets the bit
itself when it links a bin, so an installed wikipoke was never affected, but a local build was —
the build now restores it, and `npm run link` (`package.json:36`) builds before it links, so a
working copy put on the `PATH` cannot skip that step. Anything else the shipped tree needs and
`tsc` does not carry has to be added there too, and will be silent in the same way.

That second half came due in `12ff4b8`. Until then the build was `tsc` followed by a one-line
`node -e` that set the bit. [The atlas](../components/atlas.md) brought files `tsc` never sees —
its HTML, CSS and browser JavaScript, and marked, which renders the Markdown — so the build became
`tsc` followed by `scripts/build.ts` (`package.json:35`), which copies the page and marked into
`dist/atlas/web/` and then sets the bit (`scripts/build.ts:7`). marked is a devDependency, so
copying it at build time is what keeps the published package free of runtime dependencies.

## The rules this puts on `src/`

Two, both enforced by `tsconfig.json` rather than by review:

- **Only erasable syntax.** `enum`, `namespace` and parameter properties emit code, so type
  stripping cannot run them; `erasableSyntaxOnly` (`tsconfig.json:22`) turns using one into a type
  error instead of a runtime failure that only shows up in development.
- **Imports name the `.ts` file.** `./lib.ts`, not `./lib.js` — that is what Node resolves when it
  runs the sources — and `rewriteRelativeImportExtensions` (`tsconfig.json:26`) rewrites the
  specifier to `.js` on the way into `dist/`.

There are two configs because the two readings want different things: `tsconfig.json` checks
`src/`, `test/` and, since `12ff4b8`, `scripts/` (`tsconfig.json:31`), and emits nothing, which is
also what an editor picks up; `tsconfig.build.json` is the one that writes `dist/`. Tests and the
build script are checked but never compiled: they only ever run from source.

A third config, `src/atlas/web/tsconfig.json`, exists for code neither reading applies to: the
atlas's browser JavaScript, which runs as it is and is never stripped or compiled. It only checks,
with `checkJs` and the DOM's types (`src/atlas/web/tsconfig.json:11`), and `npm run typecheck`
runs it after the main one (`package.json:38`).

See [components/cli.md](../components/cli.md) for what the types changed inside the CLI, and
[the architecture](../architecture.md) for where the sources sit.
