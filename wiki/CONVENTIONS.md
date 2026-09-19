# Wiki conventions

This file is the schema of the code wiki: how it is structured and how it is maintained. The
three skills read it before they write anything, and `wikipoke check` enforces the parts a machine
can decide. It belongs to this project: edit it to fit, and when the skills or the checks
disagree with it, this file wins.

## Three verbs

| skill | what it does |
| ----- | ------------ |
| **`wikipoke-ingest`** | take code in: seeds the wiki, reconciles it with what changed, or ingests a part you aim it at |
| **`wikipoke-query`** | answer a question from the wiki, and file the answer back when it is worth keeping |
| **`wikipoke-lint`** | is the wiki sound? `wikipoke check` for what a machine decides, a deep pass for what needs reading |

A person launches the skills; the agent follows them and writes the pages directly in `wiki/`.
`wikipoke check` sits underneath and only measures: it never writes a page.

### Growth is deliberate, never a big bang

The wiki is never written in one sitting unless someone asks for that. Seeding draws the avenues and
stops; from then on it grows one part at a time, with a person reviewing each pass, and
`wikipoke-ingest all` is how they ask for the rest in one go, still logged part by part. The
backlog is computed for you:

```
wikipoke check coverage   → code no page claims, grouped by folder      (finite, mechanical)
wikipoke-lint, deep pass  → missing flows and decisions, orphan concepts, thin pages  (qualitative)
```

A hundred pages produced in one pass is a hundred pages nobody reviewed, which is worse than the
gap it closed. **Code no page covers is debt, not breakage**: coverage lists it, and it is fine
for that list not to be empty.

The wiki is **descriptive, never normative**: when the wiki and the code disagree, the code wins
and the wiki gets corrected. It **complements the project's agent instructions** (`CLAUDE.md`,
`AGENTS.md`) and never restates them: the wiki carries the *why* and the flows no single file
holds; rules live in those files and are linked, not copied.

Two boundaries are never crossed:

- **A wiki pass never modifies code.** It touches `wiki/**` and nothing else. A bug found along
  the way is noted on the page and reported to the person.
- **`synced:` is never re-stamped without re-reading the page against the code.** That field is
  the only guarantee the wiki is not lying.

## The rule that decides whether a page earns its place

> **The wiki holds what the code cannot say.**

Yes: the *why*, the invariants, the flows that cross files, the discarded alternatives, the
history of a decision, the places where three things must change together, what breaks in
practice.

No: signatures, parameter lists, export enumerations, option tables. The code and its types
already say that, and a copy guarantees it rots. To point at code, **link to it with a line**:
`src/billing/invoice.ts:42`, or a Markdown link with a line anchor,
`[invoice.ts](../src/billing/invoice.ts#L42)`; the checks read both. Take that number from the
file itself, at the moment you write the page, and only from a file you opened: a number from
memory, a commit message or another page lands on real code and looks true. `wikipoke check drift`
carries every citation through the diff from the commit that wrote it and says where the line went;
`wikipoke check lint` re-reads every citation and says when one has drifted past the end of its
file, onto a blank line or onto a lone closing bracket.

## Layout

```
wiki/
  CONVENTIONS.md        # this file: the schema, not a page
  .wikipoke-state.json  # repository checkpoint: {"version":1,"last_indexed_commit":"<sha>"}
  .wikipokeignore       # git pathspecs of files that never count for coverage
  .wikipoke-hook.sh     # the notifier the optional hooks run (managed by wikipoke)
  index.md              # the map: one line per page, from each page's `responsibility`
  log.md                # append-only narrative of every pass
  architecture.md       # the map and the layers
  flows/                # end-to-end sequences
  concepts/             # cross-cutting patterns and conventions
  components/           # units of code: modules (coarse) → components (fine)
  decisions/            # "which X when" comparisons and the choices behind them
```

`CONVENTIONS.md`, `index.md` and `log.md` are not pages (no frontmatter); every other `.md` file
under `wiki/` is a page and carries the template below.

## Page types

| `type`         | what it is                                | example                    |
| -------------- | ----------------------------------------- | -------------------------- |
| `architecture` | the map and the layers                    | `architecture.md`          |
| `flow`         | an end-to-end sequence across files       | `flows/checkout.md`        |
| `entity`       | a unit of code: a module or a component   | `components/billing.md`    |
| `concept`      | a cross-cutting pattern or convention     | `concepts/error-handling.md` |
| `decision`     | a "which X when" comparison or a choice   | `decisions/queue-backend.md` |

`wikipoke check` reads the valid `type:` values from the first column of this table: add a row
to add a type, remove one to retire it. A **module** is an `entity` at a coarser altitude, nested
by folder (`components/billing.md` links down to `components/billing/invoice.md`), not a new type.

## The one template (every page)

```markdown
---
title:            # human name
type:             # one of the types above
responsibility:   # ONE sentence: what this page is responsible for (feeds index.md)
sources:          # the code this page documents: the link to git
  - src/billing/invoice.ts
synced:           # short SHA this page was last reconciled against
confidence:       # high | inferred (optional, absent means high)
related:          # links to sibling pages (optional)
  - ./payments.md
---

<!-- body: stay high-altitude, do not transcribe the code -->
```

Five required keys, two optional. That is the whole schema. A page may carry any other key it
finds useful (`trigger:` on a flow, `options:` on a decision); the checks ignore them. There is
deliberately no date field: `git show -s --format=%cs <synced>` gives the date of the commit the
page was verified against, which is the date that matters.

- **`sources:`** is the inverted index: it is what lets `wikipoke check drift` map a changed file
  back to the pages that document it. Be **specific**: a source that claims a whole package, or
  most of the repository, makes coverage read green for code nobody wrote up, and the check warns
  about it. List only files you opened: a file you merely named is exactly what coverage exists to
  point the next pass at, and claiming it hides it from that pass. Globs are allowed
  (`src/jobs/*.ts`); a wildcard-free directory means everything under it.
- **`synced:`** is per-page staleness: if any of a page's sources changed after its `synced` SHA,
  the page is stale.
- **`confidence:`** separates *read* from *deduced*. `high` (the default) means "I read this in
  the code". `inferred` means "this is my reading and it may be wrong": use it for intent,
  rationale and history you reconstructed rather than found. Prefer asking the person over
  guessing; when you do guess, say so here.

## Links and language

- Plain Markdown links only: `[text](./other.md)`. `wikipoke check` verifies every one, so a page
  that moves shows up as broken links to fix. `[[wikilinks]]` are reported, not followed.
- Link generously. The check reports pages nothing links to: an orphan page is a page nobody finds.
- `index.md` groups pages by type; each line is the page's `responsibility`.
- Language: English. Change this line if the project documents in another language.

## Writing a page

- Open with what it is and why it exists. Never "this document describes…".
- Prose over bullet lists. Six bullets of three words each is usually a paragraph nobody wrote.
- Point at code with `path:line`, not by transcribing it.
- **One case, one sentence, with its outcome.** When a behaviour splits into cases, give each
  its own sentence that says what happens to it: "an expired token is refreshed. A revoked token is
  rejected and logged." Two cases explained together read as one, and an agent answering from the
  page merges them: the page is often all it reads.
- A page that does not fit in two screens is usually two pages.
- When a change **contradicts** what a page claimed, do not overwrite in silence: say what it used
  to be and what changed it, with the SHA. That is the part git tells badly.
- On a `decision` page the valuable half is **the discarded alternative and why**. If neither the
  code nor the history holds it, ask the person, or mark the page `confidence: inferred`.
- Use small ASCII diagrams where they clarify faster than prose, especially on `flow` and
  `architecture` pages. Label boxes with real file and symbol names.

## State and log

`wiki/.wikipoke-state.json` holds the repository checkpoint:

    {"version": 1, "last_indexed_commit": "<full sha>"}

It means "every commit up to here is reflected in the wiki". Only `wikipoke-ingest` moves it: when
seeding, and when reconciling, after the touched pages pass `wikipoke check`. Ingesting a part,
answering a query and linting never move it. It is written by a command, never typed, because a
hand-copied sha keeps its first seven characters and invents the rest:

    printf '{"version":1,"last_indexed_commit":"%s"}\n' "$(git rev-parse HEAD)" > wiki/.wikipoke-state.json

`log.md` is append-only, one entry per pass:

    ## 2026-09-11 · wikipoke-ingest
    - components/billing.md: invoices now round per line, not per total (a1b2c3d)
    - new: flows/refund.md

## Health checks

Deterministic, git only, no model:

```bash
wikipoke check              # all three, silent parts stay silent
wikipoke check drift        # is the wiki behind the code?
wikipoke check coverage     # is all the code in the wiki?
wikipoke check lint         # is the wiki internally sound?
```

Flags: `--json` (for the skills), `--strict` (exit 1 on any finding, for CI), `-v` (every file).

- **drift**: staleness on both axes. Repository: commits since `last_indexed_commit`, minus
  `.wikipokeignore`. Page: whether any of its sources changed since its own `synced`. It compares
  against the working tree, so uncommitted edits count. It also lists every citation the code moved
  since the commit that wrote it, with the line it points at now or a note that the cited line
  itself changed: on a stale page, and on a fresh one (`moved`) that was re-stamped without being
  re-pointed. A citation not committed yet counts as current.
- **coverage**: tracked files no page's `sources` claims, minus `.wikipokeignore`. Resolve a
  cluster by writing a page or, when it is out of scope, by ignoring it on purpose. The report ends
  with how many files the ignore list took out, so a rule that hides too much is visible rather
  than silent. In `.wikipokeignore`, a line starting with `!` brings paths back — which is how a
  repository whose product is prose keeps its Markdown countable while still ignoring `*.md`.
- **lint**: required keys, valid `type` and `confidence`, `synced` is a real commit, sources still
  match a tracked file, over-broad sources (a whole package, more than half the indexable files, or more than fifty, a page's folders counted together), broken links (body, `related:` and `index.md`),
  citations (`path:line` or a `#L42` link) that now land past the end of a file, on a blank line
  or on a lone closing bracket, a link whose text and line anchor disagree, orphan pages, pages missing from `index.md`, and a warning past 80 pages, where reading
  `index.md` first stops telling pages apart.

A plain run fails only on lint errors, a broken wiki. Staleness and coverage are debt.

## The signal

`wiki/.wikipoke-hook.sh` runs `drift`, prints nothing when the wiki is current, and never
fails. It leaves coverage out on purpose: that backlog is meant to outlive every pass, and a
notifier that repeats it on every commit and every session start is never silent, so it gets
muted before it has anything new to say. Hooks that run it are optional, installed only on
request with `wikipoke hooks add <name>` (`wikipoke hooks` lists them):

| hook | where | when it speaks |
| ---- | ----- | -------------- |
| `git` | `.git/hooks/post-commit` | after each commit, to the person; per clone |
| `claude` | `.claude/settings.json` | when a Claude Code session starts |
| `opencode` | `.opencode/plugin/wikipoke.js` | when an OpenCode session starts |
| `cursor` | `.cursor/rules/wikipoke.mdc` | a rule Cursor reads in every session |
| `agents` | a block in `AGENTS.md` | Codex and any agent that reads `AGENTS.md` |

Nothing writes the wiki automatically. What a machine cannot check (contradictions between pages,
expired claims, concepts with no page) is the deep pass of `wikipoke-lint`, which proposes rather
than edits.
