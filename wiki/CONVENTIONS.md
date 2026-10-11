---
type: schema
title: Wiki conventions
---

# Wiki conventions

This file is the schema of the code wiki: how it is structured and how it is maintained. The
skills read it before they write anything, and `wikipoke check` enforces the parts a machine
can decide. It belongs to this project: edit it to fit, and when the skills or the checks
disagree with it, this file wins.

## Three verbs

| skill | what it does |
| ----- | ------------ |
| **`wikipoke-ingest`** | take code in: seeds the wiki, reconciles it with what changed, or ingests a part you aim it at |
| **`wikipoke-query`** | answer a question from the wiki, and file the answer back when it is worth keeping |
| **`wikipoke-lint`** | is the wiki sound? `wikipoke check` for what a machine decides, a deep pass for what needs reading |

Two narrower skills feed the `decisions/` pages: `wikipoke-decision` writes one decision a person
tells it, after a yes, and `wikipoke-implement` leaves notes in `.inbox/` for the next ingest.

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
  .inbox/               # decision notes waiting for the next ingest; never committed
  index.md              # the map: one line per page, from each page's `responsibility`
  log.md                # the history of every pass, newest first
  architecture.md       # the map and the layers
  flows/                # end-to-end sequences
  concepts/             # cross-cutting patterns and conventions
  components/           # units of code: modules (coarse) → components (fine)
  decisions/            # "which X when" comparisons and the choices behind them
```

`CONVENTIONS.md`, `index.md` and `log.md` are not pages; every other `.md` file under `wiki/`,
outside dot-folders such as `.inbox/`, is a page and carries the template below. The wiki is also an
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) v0.2 bundle,
which other tools can read without knowing wikipoke. That is why this file opens with a two-line
frontmatter (`type: schema`), why `index.md` may open with `okf_version: "0.2"` and nothing else,
and why `log.md` has the shape below. The checks never read `index.md` or this file as pages.

## Page types

| `type`         | what it is                                | example                    |
| -------------- | ----------------------------------------- | -------------------------- |
| `architecture` | the map and the layers                    | `architecture.md`          |
| `flow`         | an end-to-end sequence across files       | `flows/checkout.md`        |
| `entity`       | a unit of code: a module or a component   | `components/billing.md`    |
| `concept`      | a cross-cutting pattern or convention     | `concepts/error-handling.md` |
| `decision`     | a "which X when" comparison or a choice   | `decisions/queue-backend.md` |

`wikipoke check` reads the valid `type:` values from the first column of this table: add a row
**and its entry below** to add a type, remove both to retire it. A **module** is an `entity` at a
coarser altitude, nested by folder (`components/billing.md` links down to
`components/billing/invoice.md`), not a new type.

### Where each type comes from

What a page of each type holds, and where its evidence comes from. The skills read this list to
write, file and look for pages of each type, so a type you add needs its entry here too: the table
only tells the checker that the type exists.

- `architecture`: the map and the layers, one page. Evidence: the folder tree, the entry points
  and the manifest; every other page links from it.
- `entity`: a unit of code, a module or a component, and what it owns. Evidence: a folder, the
  module and its files. Coverage counts files, so it only ever asks for this type.
- `flow`: one sequence from start to end. Evidence: an entry point (a route, a command, a job, a
  webhook, a listener), followed across modules until the sequence ends.
- `decision`: a choice, with the alternative set aside and why. Evidence: the notes in
  `wiki/.inbox/` first; then the history and the prose: `git log` (a fix that changed the
  design, an "instead of", a revert) and the docs, plans and ADRs the ignore list keeps out of
  coverage but not out of reading.
- `concept`: a pattern or a convention. Evidence: code that three or more modules repeat.

<!-- An added type, for example:
- `runbook`: how to do one operation in production, step by step. Evidence: the deploy
  scripts, the CI config and the incident notes; one page per operation. -->

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
finds useful (`trigger:` on a flow, `options:` on a decision); the checks ignore them. Decision
pages have a few of their own, below. There is deliberately no date field: `git show -s --format=%cs <synced>` gives the date of the commit the
page was verified against, which is the date that matters.

The block is YAML, and other tools (Obsidian, site generators, any YAML library) read it strictly.
**Quote a value that holds `: ` or ` #`, or starts with a symbol** such as `{`, `*`, `&`, `!`, `|`,
`>`, `%`, `@` or `-`, in single quotes, where a backslash is just a backslash and an inner `'` is
written twice: `responsibility: 'The map: who writes, who measures.'`. A short list may stay
`[a, b]` when no item needs quoting; otherwise write it one `- item` per line. Use spaces, not
tabs. wikipoke reads a quoted value the same, and `wikipoke check lint` warns about the rest.

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

## Never a source

Some files change with most commits, whatever those commits are about: lock files, and in many
projects the entry point, the route or command registry, a version catalog. A page that lists one
in `sources:` is flagged stale by work that has nothing to do with it, and people learn to ignore
the flag. Cite the files the claim rests on instead. `wikipoke check lint` warns about a source
that names a file below; a page that really is about one of them keeps it, and the warning. Add
this project's own; an entry with no `/` is a file name, found in any folder.

- `package-lock.json`
- `pnpm-lock.yaml`
- `yarn.lock`
- `bun.lock`
- `bun.lockb`
- `composer.lock`
- `Gemfile.lock`
- `poetry.lock`
- `uv.lock`
- `Cargo.lock`
- `go.sum`

## Decisions worth recording

A decision page is worth its place only when it tells what the code cannot: why this and not the
alternative. This section is the bar a decision has to clear before an agent writes it down on
its own: the `decisions` hook and the `wikipoke-implement` skill capture by it while code is being
written, and `wikipoke-ingest` applies it again before a note becomes a page. Widen or narrow it
here; the hook and both skills follow. A wider variant waits, commented, below. A decision a
person asks to keep, through `wikipoke-decision`, is the person's to judge: the skill only asks
for the alternative that was set aside and why.

Record a decision only when the change

- introduces a runtime dependency, or a tool the build depends on (not a version bump),
- introduces or changes an architectural pattern, or
- makes a choice that is hard to reverse: a data format, a public contract, a stored schema, a
  security primitive.

Say whether it is reversible. Do not record routine fixes, naming, mechanical refactors,
preferences a linter or formatter already enforces, choices with no real alternative, anything the
code already makes evident, or anything already written down in the spec, the plan or a wiki page
(ingest checks the wiki; capture need not).

<!-- Not in force. A wider bar, for a project that wants more decisions kept: replace the list above with:
Record a decision when the change chooses between plausible alternatives and the choice affects
architecture, contracts, invariants, dependencies, data, concurrency, security or performance,
whether it is easy to reverse or not. -->

**On the page.** A decision page carries, besides the template:

- `decided_by: agent` or `person`: who took it, only when that is known first hand: a note
  says it, and a person who tells a decision through `wikipoke-decision` is `person`. A page
  reconstructed from the code, the specs or the history leaves it out rather than guess.
- `reversible: true` or `false`, when it is known.
- `planned: true` while the code does not carry the decision out yet. Its `sources:` are the
  files that exist and will change, never one still to be written, which the body names instead.
  The commit that carries it out makes the page stale, and the ingest that reads that diff drops
  the key.
- `status: deprecated` once another decision reverses it and the code follows the new one. The
  page keeps its body, which is the history, and opens with a link to the decision that replaced
  it; that one links back. While the reversal is still `planned: true`, the old page stays in
  force and its opening line says a planned decision will reverse it; the ingest that drops
  `planned:` from the new page marks the old one. `status`
  is Open Knowledge Format's own key (`draft`, `stable`, `deprecated`; absent means `stable`), so
  no other value goes in it.

A decision with no code behind it, a policy or a process, cites the file that states or enforces
it (`AGENTS.md`, a CI workflow). A decision page always has `sources:`.

**The note.** One file per decision in `wiki/.inbox/`, never several in one, named `YYYY-MM-DD-<slug>.md` so two
branches never collide, written in seconds when the choice is made, without reading the wiki:

```markdown
---
decided_by: agent
reversible: false
files: [src/audio/capture.ts, src/audio/ring-buffer.ts]
---
Chose a preallocated ring buffer between capture and the file writer.
Discarded a mutex-protected queue: the realtime callback could block.
```

What was chosen, what was discarded and why, and the files it constrains; `decided_by` is `agent`
or `person`. Nothing else: the links
and the context are added by `wikipoke-ingest`, which reads the note against the code, writes or
extends the decision page, and deletes the note. A note is a lead, not a fact to copy.

The inbox is scratch work and never committed: it holds a `.gitignore` with `*`, which the
`decisions` hook places and whoever writes the first note creates when it is missing. Notes live
only in the working copy that wrote them, so integrate them before the branch or the worktree goes
away; `wikipoke check drift` counts them until then.

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

`log.md` is the history, **newest first**: one `## YYYY-MM-DD` heading per day, and under it one
`* **<skill>**: …` entry per pass, the newest at the top. The bold part names the skill and, when
there is one, the mode or target (`wikipoke-ingest all: src/billing`, `wikipoke-lint --deep`).
Details go in nested items:

    # Log

    ## 2026-09-11

    * **wikipoke-ingest**: reconciled 3 commits since `f00ba47`.
      - components/billing.md: invoices now round per line, not per total (a1b2c3d)
      - new: flows/refund.md

A log from before this shape (`## 2026-09-11 · wikipoke-ingest`, oldest first) still counts: lint
warns about it, and the next pass that writes the log rewrites it, reordering the entries and moving
each skill from its heading into its entry, without changing what they say.

## Health checks

Deterministic, git only, no model:

```bash
wikipoke check              # all three, silent parts stay silent
wikipoke check drift        # is the wiki behind the code?
wikipoke check coverage     # is all the code in the wiki?
wikipoke check lint         # is the wiki internally sound?
```

Flags: `--json` (for the skills), `--strict` (exit 1 on any finding, for CI), `-v` (every file).

- **drift**: staleness on both axes, plus the decision notes waiting in `.inbox/` (`pending`),
  which never fail a plain run and are never seen by CI, since the inbox is not committed. Repository: commits since `last_indexed_commit`, minus
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
- **lint**: required keys, frontmatter a strict YAML parser reads differently (a warning), valid `type` and `confidence`, `synced` is a real commit, sources still
  match a tracked file, a source listed under "Never a source", over-broad sources (a whole package, more than half the indexable files, or more than fifty, a page's folders counted together), broken links (body, `related:` and `index.md`),
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
| `decisions` | its own block in `AGENTS.md` | not a notifier: asks agents to note decisions in `.inbox/` as they work |

Nothing writes the wiki automatically. What a machine cannot check (contradictions between pages,
expired claims, concepts with no page) is the deep pass of `wikipoke-lint`, which proposes rather
than edits.
