<p align="center"><img src="assets/wikipoke.webp" alt="wikipoke" width="520"></p>

# Wikipoke

A code wiki that agents maintain. Three skills write it; one small CLI sets it up and checks it,
and never writes a page.

```
person ──► /wikipoke-ingest ──► the agent reads the code, writes pages in wiki/
                                          │
                                          ▼
                                   wikipoke check        lint · drift · coverage
                                          ▲
optional hooks ──► wiki/.wikipoke-hook.sh                "the wiki is 3 commits behind"
(after a commit, when an agent session starts)
```

- **The skills govern.** A person launches `wikipoke-ingest`, `wikipoke-query` or `wikipoke-lint`;
  the agent follows the skill and writes Markdown pages directly under `wiki/`. The rules live in
  `wiki/CONVENTIONS.md`, which the project owns and edits.
- **The CLI only measures.** `wikipoke check` is deterministic, reads git and the pages, and
  reports. It has no publish step, no lock, no staging and no plan to follow.
- **Coverage is debt, not failure.** Code no page covers is listed so the next pass knows where to
  go. A plain `check` fails only when the wiki is broken: a missing field, a dead source, a broken
  link.

## Install

Node 22.18 or later and git. Wikipoke has no runtime dependencies: the CLI is TypeScript
compiled to plain ESM on install, and everything it needs at run time is in Node's standard
library.

```sh
npm install -g wikipoke        # any repository, any language
npm install -D wikipoke        # or as a dependency of a JavaScript project
```

Before the first npm release, or to run a checkout, `github:delineas/wikipoke` works in either
command, and `npm run link` inside this repository compiles it and puts `wikipoke` on your `PATH`
(`npm run unlink` takes it off again). Don't point a project at a checkout with
`npm install -D ../wikipoke`: npm links the folder and runs its `prepare` there, which fails
unless the checkout already has its own devDependencies, and the project's `package.json` ends up
naming a path that exists only on your machine. Link it globally instead; the hooks find a global
`wikipoke` as well as a local one.

Then, in the repository:

```sh
wikipoke init
```

In a terminal, `init` ends by asking which hooks to install; Enter installs none. Then, in your
agent, run the `wikipoke-ingest` skill to seed the wiki. It draws the avenues (architecture, the
main flows, one page per subsystem) and stops; later passes grow it one part at a time.

**Installing through an agent.** An agent can run `wikipoke init` for you. With nobody at the
terminal there is no one to answer the hook question, so `init` installs none and hands the
decision to the agent instead of dropping it: it prints what is missing, what each hook would do,
and the command. Which one fits is something the agent knows about itself and `init` cannot see —
so it asks you, and runs `wikipoke hooks add <name>`. Nothing installs a hook on its own.

## What `init` writes

| File | Owner | Purpose |
| --- | --- | --- |
| `wiki/CONVENTIONS.md`¹ | the project | the schema: page types, the template, the writing rules |
| `wiki/.wikipokeignore`¹ | the project | files that never count for coverage (tests, lockfiles, …); a `!` line brings some back |
| `.agents/skills/wikipoke-*/SKILL.md` | wikipoke | the three skills, for agents that read the neutral folder |
| `.claude/skills/wikipoke-*/SKILL.md` | wikipoke | the same skills, for Claude Code, which reads only this one |

¹ Or the directory `--dir` set, see below.

Both skill homes are always written. Claude Code reads only `.claude/skills` and runs perfectly
well against a checkout with no `.claude/` and no `CLAUDE.md` in it, so there is nothing in a
repository to detect it by; writing the skills for an agent that never comes costs three inert
Markdown files, and not writing them costs the agent every skill it has. A skill is inert either
way — nothing runs one until a person names it — which is the whole reason hooks are treated
differently below.

`init` never writes pages, `index.md`, `log.md` or `.wikipoke-state.json`: the first ingest pass
does.

**Somewhere other than `wiki/`.** `wikipoke init --dir docs/wiki` puts the wiki there and writes a
one-line `.wikipoke.json` so every later command agrees. The skills, the hooks and the schema are
written with the real path in them, so nothing has to look it up. To move an existing wiki, move
the folder, edit `.wikipoke.json` and run `init` again to refresh the skills.

## Hooks (optional)

A hook tells you or your agent, at the right moment, that the wiki has fallen behind. Every hook
runs the same notifier, `wiki/.wikipoke-hook.sh`, which prints what `drift` finds, stays silent
when the wiki is current, and never fails or calls a model. None of them writes the wiki. Coverage
stays out of it on purpose: that backlog is meant to outlive every pass, and a notifier that
repeats it at every commit and every session start is never silent, which is how a notifier gets
muted.

**Install at least one.** Without a hook nothing ever tells you the wiki is stale — `wikipoke check`
speaks only when someone runs it — and a wiki nobody is told about is one that quietly stops being
true. `wikipoke hooks` says so whenever none is installed. Only `git` has to be installed again in
every clone, because `.git/hooks` is not versioned; the other four are ordinary repository files,
so committing one covers everyone who clones.

```sh
wikipoke hooks                        # the list: which are installed, which are outdated
wikipoke hooks add git claude         # install some, or update installed ones
wikipoke hooks remove claude          # take one out
```

| Hook | Writes | Speaks |
| --- | --- | --- |
| `git` | `.git/hooks/post-commit` | after each commit, in your terminal (per clone) |
| `claude` | a `SessionStart` entry in `.claude/settings.json`, plus the Claude Code skills | when a Claude Code session starts |
| `opencode` | `.opencode/plugin/wikipoke.js` | when an OpenCode session starts, once per session |
| `cursor` | `.cursor/rules/wikipoke.mdc` | a rule Cursor reads in every session |
| `agents` | a delimited block in `AGENTS.md`, created if missing | Codex and any agent that reads `AGENTS.md` |

The notifier is written with the first hook and removed with the last.

## Files wikipoke manages

Files owned by the project (`CONVENTIONS.md`, `.wikipokeignore`) are written once and never
overwritten; when `CONVENTIONS.md` differs from the template a newer wikipoke ships, `init` says so
and names the template, so the project can carry over what it wants. Files owned by wikipoke carry
a `managed by wikipoke` line. A file in their place that lacks that line is left alone, and the
command says what to add by hand. In shared files (`.claude/settings.json`, `AGENTS.md`) wikipoke
adds and removes only its own entry.

**After upgrading wikipoke**, run `wikipoke init`. It refreshes the skills, which are inert until
someone names one. It does not refresh the hooks, which act on their own: it lists the ones an
older version installed as `outdated`, with the command that updates them, and leaves them as they
are until someone runs it.

## The skills

| Skill | What it does |
| --- | --- |
| `wikipoke-ingest` | seeds the wiki; reconciles pages with what changed since the checkpoint; or, given a path, documents a part no pass has covered |
| `wikipoke-query` | answers from the wiki first, falls back to the code, and offers to file the answer back |
| `wikipoke-lint` | explains what `check` found; with `--deep`, reads the pages for contradictions, expired claims and gaps |

Ask questions through `/wikipoke-query <question>`. An agent does not always reach for the wiki on
its own, and the saving below is only there when it does.

## Does it save tokens?

Measured on two TypeScript repositories, each with the same code on two branches — one with a
seeded wiki, one without — and a fresh OpenCode session per question (model: glm-5.3-flash). Three
questions a wiki page covers, three runs each. Tokens are everything the model processed (input,
cached input and output) summed over the whole answer.

| Repository | No wiki (median tokens per question) | With `/wikipoke-query` | Tokens | Cost |
| --- | --- | --- | --- | --- |
| a library: 32 source files, ~11k lines, a third of them comments | 308k | 157k | −49% | −40% |
| a CLI: 39 source files, ~7.5k lines, 7% comments | 384k | 242k | −37% | −48% |

The saving comes from steps, not from shorter reads. Every step re-sends the whole conversation —
about 28k tokens of system prompt and tool definitions before anything is read — and what a tool
returns is small by comparison, so an answer costs roughly its number of steps. Without the wiki
the agent searches and opens files until it has the picture, 7 to 15 steps on average per
question; with it, it reads the index, then the candidate pages together, and opens code only at
the line the answer turns on, 5 to 9. Answers covered the same facts either way, with the one exception below.

The same runs showed three more things:

- **Name the skill when you want the saving.** Left to decide, the agent opened the wiki in 17 of
  18 runs with the current skill description and saved about as much (−50% and −38% median), but
  in only 3 of 9 on the library with an earlier description that fired on "how does X work", and
  every skipped wiki is paid in exploration. `/wikipoke-query` removes the guess.
- **A page is only as good as its sentences.** One page explained two cases in the same paragraph.
  Four of six answers that read it merged them, while every answer that read the code kept them
  apart; rewritten with one sentence per case, six of six were right. `CONVENTIONS.md` carries
  that rule now.
- **The wiki costs tokens to build.** Covering the library's whole backlog in one pass took about
  14M tokens, which the saving above pays back after roughly 70 to 100 questions.

Three runs per cell with a wide spread (one no-wiki answer on the CLI took 1.6M tokens), one model,
and questions the wiki covers: this measures these two repositories, not yours.

## `wikipoke check`

```sh
wikipoke check              # all three
wikipoke check drift        # commits not indexed, stale pages, and citations the code moved
wikipoke check coverage     # tracked files no page's `sources:` claims
wikipoke check lint         # fields, types, links, citations, dead and over-broad sources, orphans
```

`--json` for the skills, `--strict` to exit 1 on any finding (CI), `-v` to list every file.
A plain run exits 1 only on lint errors.

## A page

```markdown
---
title: Billing
type: entity
responsibility: How invoices are computed, rounded and taxed.
sources:
  - src/billing/
synced: a1b2c3d
---

Invoices round per line, not per total, because… See [the checkout flow](../flows/checkout.md).
```

`sources:` ties the page to the code and `synced:` to the commit it was checked against; together
they are how `drift` knows the page is stale. Links are plain Markdown, so `check` can verify every
one, and so are the citations in the body — `path:line`, or a link with a GitHub line anchor
(`#L42`). `drift` carries each citation through the diff from the commit that wrote it and says
which line it points at now — on a stale page, and on one re-stamped without its pointers being
moved — and `lint` re-reads each one and reports those that fall past the end of their file, on a
blank line or on a lone closing bracket. The full contract is in
the `CONVENTIONS.md` that `init` writes, and the valid `type:` values are the rows of its page-type
table.

## Uninstall

```sh
wikipoke uninstall
```

Removes the skills and every hook, including wikipoke's entries in shared files. `wiki/` stays: it
is the project's knowledge.

## Where this comes from

The design is the wiki inside the widgetron repository, made repository-agnostic: the same three
verbs (after Andrej Karpathy's LLM-maintained wiki pattern), the same checks and the same page
contract. Version 0.1 on the `main` history took a different road, with the CLI as the writer
(planned batches, staged publication, a writer lock, a completeness seal). Agents ended up driving
the CLI instead of following the skills, and every real run surfaced new rules to add. This
version keeps the writing in the skills and the CLI read-only.

## Development

The CLI is TypeScript under `src/`, and it is read two different ways.

```sh
npm test         # node --test test/*.test.ts — runs the sources, no build first
npm run typecheck
npm run build    # tsc -> dist/, the ESM that actually ships
npm run link     # build, then `npm link`: the working copy becomes your global wikipoke
npm run unlink   # take it off the PATH again
```

Node runs a `.ts` file by stripping the types out of it, so during development there is nothing
to build and the tests exercise the same file you just edited. It refuses to do that for anything
under `node_modules/`, though, which is exactly where an installed wikipoke lives — so what ships
is compiled: `prepare` runs `tsc` on install, and `bin` points at `dist/bin/wikipoke.js`.

Two consequences for anyone editing `src/`: imports name the `.ts` file (`./lib.ts`; `tsc`
rewrites the specifier to `.js` when it emits), and only syntax that erases to nothing is allowed —
no `enum`, no `namespace`, no parameter properties. `erasableSyntaxOnly` in `tsconfig.json` fails
the check rather than letting one through.
