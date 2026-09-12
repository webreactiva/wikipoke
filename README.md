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

Node 22 or later and git. Wikipoke has no dependencies and no build step.

```sh
npm install -g github:delineas/wikipoke        # any repository, any language
npm install -D github:delineas/wikipoke        # or as a dependency of a JavaScript project
```

Then, in the repository:

```sh
wikipoke init
```

In a terminal, `init` ends by asking which hooks to install; Enter installs none. Then, in your
agent, run the `wikipoke-ingest` skill to seed the wiki. It draws the avenues (architecture, the
main flows, one page per subsystem) and stops; later passes grow it one part at a time.

**Installing through an agent.** An agent can run `wikipoke init` for you. With nobody at the
terminal, `init` installs no hooks and tells the agent to ask you which ones you want, then run
`wikipoke hooks add <name>...`.

## What `init` writes

| File | Owner | Purpose |
| --- | --- | --- |
| `wiki/CONVENTIONS.md`¹ | the project | the schema: page types, the template, the writing rules |
| `wiki/.wikipokeignore`¹ | the project | files that never count for coverage (tests, lockfiles, …); a `!` line brings some back |
| `.agents/skills/wikipoke-*/SKILL.md` | wikipoke | the three skills, for agents that read the neutral folder |
| `.claude/skills/wikipoke-*/SKILL.md` | wikipoke | the same skills for Claude Code, when the repository uses it |

¹ Or the directory `--dir` set, see below.

Claude Code is detected by a `.claude/` folder or a `CLAUDE.md` file; `--claude` adds its skills
anyway. `init` never writes pages, `index.md`, `log.md` or `.wikipoke-state.json`: the first
ingest pass does.

**Somewhere other than `wiki/`.** `wikipoke init --dir docs/wiki` puts the wiki there and writes a
one-line `.wikipoke.json` so every later command agrees. The skills, the hooks and the schema are
written with the real path in them, so nothing has to look it up. To move an existing wiki, move
the folder, edit `.wikipoke.json` and run `init` again to refresh the skills.

## Hooks (optional)

A hook tells you or your agent, at the right moment, that the wiki has fallen behind. Every hook
runs the same notifier, `wiki/.wikipoke-hook.sh`, which prints what `drift` and `coverage` find,
stays silent when the wiki is current, and never fails or calls a model. None of them writes the
wiki.

```sh
wikipoke hooks                        # the list, and which are installed
wikipoke hooks add git claude         # install some
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
overwritten. Files owned by wikipoke carry a `managed by wikipoke` line and are refreshed by
running `init` or `hooks add` again. A file in their place that lacks that line is left alone, and
the command says what to add by hand. In shared files (`.claude/settings.json`, `AGENTS.md`)
wikipoke adds and removes only its own entry.

## The skills

| Skill | What it does |
| --- | --- |
| `wikipoke-ingest` | seeds the wiki; reconciles pages with what changed since the checkpoint; or, given a path, documents a part no pass has covered |
| `wikipoke-query` | answers from the wiki first, falls back to the code, and offers to file the answer back |
| `wikipoke-lint` | explains what `check` found; with `--deep`, reads the pages for contradictions, expired claims and gaps |

## `wikipoke check`

```sh
wikipoke check              # all three
wikipoke check drift        # commits not indexed, pages whose sources moved since their `synced:`
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
one, and so are the `path:line` citations in the body: `lint` re-reads each one and reports those
that now fall past the end of their file or on a blank line. The full contract is in the `CONVENTIONS.md` that `init` writes, and the valid `type:` values
are the rows of its page-type table.

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

```sh
npm test
```
