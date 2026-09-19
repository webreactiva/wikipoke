---
name: wikipoke-ingest
description: "Take code into the wiki. Seeds the wiki when it does not exist yet; reconciles it with what changed since the last checkpoint; or, given a path or a topic (a flow, a decision), ingests a part of the repository no pass has covered. Use when: (1) the user invokes /wikipoke-ingest, (2) the wiki notifier says the wiki is behind or a page is stale, (3) the user says 'update the wiki', 'seed the wiki', 'create the wiki', 'document <subsystem>', typically when closing a feature, or 'document everything', 'keep going until it is done' (that is `all`)."
argument-hint: "[<path> | <topic> | all]"
---
<!-- managed by wikipoke: `wikipoke init` rewrites this file. Project rules go in wiki/CONVENTIONS.md. -->

# wikipoke-ingest: take the code into the wiki

One verb, three ways in. Two are decided for you; the third is the one you aim.

```
argument given?
   │
   ├── yes ──► INGEST A PART   that path or topic, whether or not it ever changed
   │           (`all` = every part of the backlog, one after another)
   │
   └── no ──► wiki/.wikipoke-state.json exists?
                 ├── no  ──► SEED       the avenues, once per repository
                 └── yes ──► RECONCILE  only what changed since the checkpoint
```

**Read `wiki/CONVENTIONS.md` first.** The layout, the page types, the template,
`confidence:`, the writing rules and the checkpoint contract live there, not here.

`wikipoke` below is the CLI: `node_modules/.bin/wikipoke` when the project depends
on it, `wikipoke` when it is installed globally. It only measures; you write the
pages yourself, directly under `wiki/`.

Two boundaries, in every mode: **never modify code** (touch `wiki/**` and nothing
else; running the project's builds, generators or scripts counts, so read them
instead), and **never re-stamp `synced:` on a page you did not re-read against the
code**.

**Write as you go.** Read what one page needs, write that page, then move on to the
next. Never study the whole repository before writing: reading you are not about to
turn into a page is spent twice, once now and again when you have forgotten it. If
you notice you are reading for pages you have not started, stop and write the one in
hand. A page written early and corrected later beats a perfect plan that never
reaches the disk.

**Each page type has its own evidence, and coverage only sees the first.**

| type | where it comes from |
| --- | --- |
| `entity` | a folder: the module and what it owns |
| `flow` | an entry point (a route, a command, a job, a webhook, a listener), followed across modules until the sequence ends |
| `decision` | the history and the prose: `git log` (a fix that changed the design, an "instead of", a revert) and the docs, plans and ADRs the ignore list keeps out of coverage but not out of reading |
| `concept` | a pattern that three or more modules repeat |

Coverage counts files, so following it alone writes `entity` pages and nothing else.
A concept is a pattern, not a place for the folders left over: tests, config and
tooling go in the ignore list or on the page of what they serve.

---

## Mode A · SEED (no `.wikipoke-state.json`)

```
CODE @ HEAD
   │  survey: the tree, manifests, READMEs, `git log --oneline`   (no source files yet)
   ▼
tailor .wikipokeignore ──► write architecture.md now, from the survey
   ▼
one avenue at a time:  read what its page needs ──► write the page ──► next
   ▼
index.md · log.md (first entry) · .wikipoke-state.json { last_indexed_commit: HEAD }
   ▼
wikipoke check must pass without errors before you are done
```

1. **Record the base SHA:** `git rev-parse --short HEAD` for every page's `synced:`,
   copied from the command's output. The full form goes into the checkpoint at the
   end, written by a command rather than by hand (step 8). Read
   `git log --oneline`: the history explains why the code looks like this and lives
   in no file.
2. **Survey without reading the sources.** `git ls-files`, the manifests, the
   READMEs and the project's agent instructions are enough to name the layers and
   the entry points. Source files come later, one page at a time.
3. **Tailor `wiki/.wikipokeignore`, in both directions.** It starts generic. Add what
   in this repository is not code worth documenting: tests, fixtures, generated
   files, vendored code, build plumbing. Then run `wikipoke check coverage -v` and
   read **both** ends of it: the clusters still uncovered, and the last line, which
   says how many files the ignore list took out. The starting list ignores `*.md`,
   so in a repository whose product is prose — prompts, skills, agent instructions,
   a spec — it has just hidden the very thing to document. Bring those back with a
   `!` line (`!prompts/**`), which wins wherever it appears. Ignoring is a conscious
   call in both directions: say in the log what you ignored and what you brought back.
4. **Write `architecture.md` now**, from the survey: the map, the layers, the entry
   points. Mark what you have not read in the code yet `confidence: inferred`. Every
   other page links from it, and it gets corrected as later pages teach you more.
5. **Then one avenue at a time.** Pick the next avenue, read only the files its page
   needs, write the page, link it from `architecture.md`, and move on. The avenues,
   at the altitude of the page types and never one page per file:
   - `flows/`: the sequences that cross files and that no single file tells.
     These are the highest-value pages; do not ship a seed with only one.
   - `components/`: one **module** page per subsystem. Finer pages only for units
     that hide a mechanism; the rest grow later.
   - `concepts/`: the cross-cutting patterns and conventions.
   - `decisions/`: the choices behind the code, with the discarded alternative.
6. **Every page** uses the template with **narrow, verified** `sources:` covering
   what you actually read; never claim a whole package or a folder like `src/`, and
   never list a file you only named — coverage is how the next pass finds it, and a
   claim hides it from that pass. Mark anything you
   reconstructed rather than read with `confidence: inferred`. Link only to pages
   that already exist. **Cite only files you opened in this pass**, and take every
   line number (`path:line`, or a `#L42` link) from that file alone, as you write the page — a number carried over
   from a listing of several files is wrong by however many lines came before it.
   A claim about code you did not open (from a README, a commit message, a file
   name) is `confidence: inferred` and carries no `path:line`: a line number you
   never read is a guess that lands on real code, and no check can tell it apart
   from a true one.
7. **Write `index.md`** grouped by type, one line per page (its `responsibility`).
8. **Write the first `log.md` entry, then the checkpoint**, with this exact command —
   never type the sha yourself; a hand-copied sha keeps its first seven characters
   and invents the rest:
   ```sh
   printf '{"version":1,"last_indexed_commit":"%s"}\n' "$(git rev-parse HEAD)" > wiki/.wikipoke-state.json
   ```

**Seeding stops at the avenues, on purpose**: the map, two or three flows, one page
per main subsystem — a dozen or so pages in a single package, one or two more per
workspace in a monorepo. Then let Mode C fill in the
neighbourhoods one at a time. Coverage will list exactly what you left, and that
list being long is fine: it is the backlog, not a failure. Say so when you close
(see the end of this skill): a seed that does not say what it left reads as done.

---

## Mode B · RECONCILE (`.wikipoke-state.json` exists)

Reconcile, don't accumulate: the code moved, bring the pages back in line.

```
wikipoke check drift --json
   │  repo: commits since the checkpoint
   │  stale[]: pages whose sources moved past their own synced:
   │           + citations[]: their pointers the code moved
   │  moved[]: fresh pages whose pointers the code moved anyway
   ▼
   read ONLY each stale page's diff ──► rewrite the stale sections
   re-point every moved citation, stale page or not ──► re-stamp synced:
   new code → propose a page  ·  moved/deleted code → fix or retire the page
   ▼
index.md · log.md entry · advance .wikipoke-state.json to HEAD (after the check passes)
```

1. **Detect.** `wikipoke check drift --json` gives `repo` (commits since the
   checkpoint) and `stale[]` (the pages whose sources changed since their own
   `synced:`). Nothing stale and the repository current: **say so and stop**; do
   not invent work.
2. **Read the diff, not the repository.** For each stale page, read only its own
   diff: `git diff <its synced> HEAD -- <its sources>`. Anything in `skipped[]` has
   a broken contract; fix that first.
3. **Reconcile.** Rewrite only the stale sections, so hand-written notes survive.
   When the change **contradicts** what the page claimed, say what it used to be and
   what changed it, with the SHA. Re-check `confidence:` while you are there.
4. **Re-point the citations, then re-stamp.** Each stale page's `citations[]`, and
   each page in `moved[]`, lists the pointers the code moved since they were
   written, `path:line` and `#L42` links alike, with `raw` as the page writes it
   (update a line number repeated in the link text too). `now` is the line each
   points at today; `now: null` means the cited line itself was edited or deleted,
   so open the file and find what the sentence was about. Then set `synced:` to
   `git rev-parse --short HEAD`. Re-stamping does not hide a pointer you skipped —
   drift dates each citation by the commit that wrote it and reports the page under
   `moved[]` — and one you already re-pointed is current, committed or not.
5. **New and moved code.** Changed files no page covers: propose a page, or leave
   them to coverage. Sources pointing at moved or deleted files: fix or retire the
   page.
6. **Refresh `index.md`** for any page added, retitled or with a new
   `responsibility`.
7. **Seal.** Append a `log.md` entry and, **only after the final check passes**,
   advance the checkpoint with the same command as a seed — never by typing the sha:
   ```sh
   printf '{"version":1,"last_indexed_commit":"%s"}\n' "$(git rev-parse HEAD)" > wiki/.wikipoke-state.json
   ```

---

## Mode C · INGEST A PART (an argument was given)

Aimed, not reactive. The target is a path (`src/billing`), a topic
(`the guides unlock flow`, often one a `wikipoke-lint --deep` pass proposed), or `all`
for everything still outstanding. A topic is a flow or a decision, not a folder:
start from its entry point or its history, and skip the coverage step.

```
wikipoke check coverage -v   the backlog, grouped by folder
      │
      ▼
pick ONE cluster ──► read that code ──► write the pages it earns
      ▼
index.md · inbound links · log.md      (checkpoint untouched)
```

1. **Scope it.** With a path, work only inside it. With `all`, run the loop below.
2. **Decide what earns a page from the file list, then read for one page at a
   time.** A module page per subsystem, plus the flows that cross its files. Never a
   page per file: a cluster of 19 files is usually two pages, not nineteen.
3. **Write each page as soon as you have read for it**, with the template, narrow
   `sources:` covering exactly what you read, and `synced:` set to
   `git rev-parse --short HEAD`.
4. **Link them in.** Every new page needs an inbound link from a page that already
   exists (usually `architecture.md` or its module page) and its line in `index.md`.
5. **Do not advance `.wikipoke-state.json`.** Closing a coverage gap says nothing about the
   repository being indexed up to HEAD. Only Mode B moves the checkpoint.
6. **Log it** as `## <date> · wikipoke-ingest <target>`.

### `all`: every part gets its pass

`all` is the person saying they want the whole repository, tokens and all ("document
everything", "don't stop until it's done"). Do not stop to ask between parts:

```
wikipoke check coverage ──► its clusters are the parts
      ▼
next cluster with no `all` entry in log.md ──► steps 2–6 on it ──► wikipoke check
      ▼
every cluster has its entry ──► the flows and decisions ──► done
```

- **Done means every part had its pass, not that coverage reads zero.** Emptying it
  honestly means reading every file. What you did not open stays uncovered, and the
  close says how much.
- **Never widen a source to make the number drop**: not to a folder you skimmed, not
  on a page already written. Listing a file's classes and functions is not reading it.
- **One cluster, one part, one entry**, `## <date> · wikipoke-ingest all: <cluster>`,
  naming the pages written and what stayed uncovered. The entries are how the person
  reviews the run part by part, and how a run cut short by the context or the session
  resumes: `wikipoke-ingest all` again takes the clusters with no entry.
- **Code that earns no page** (tests, migrations, translations) gets a
  `.wikipokeignore` line with the reason in the log. When it is worth explaining, add
  a page that cites a few representative files and name that page in the reason: the
  schema, not ninety migrations.
- **Then the pages no folder asks for.** Coverage counts files, so the loop only
  writes module pages. Before closing, write the flows the log noted as deferred and
  the decisions `git log` explains: a fix that changed the design, a "why not X".
- When it ends, say how many pages it wrote, by type and by part.

---

## Every mode ends here

**Verify:** `wikipoke check`. Fix every error. Warnings about orphans, the index,
over-broad sources or citations are yours to fix too. Coverage and staleness left
over are debt: report them, do not chase them in the same pass (unless the pass is `all`).

**Close with what is left.** Run `wikipoke check coverage` and tell the person, in
numbers: the code files the wiki now covers out of the total, the largest clusters still
uncovered, how many files the ignore list hides, and the pages by type. Name the flows
and decisions you saw and did not write. Fewer flows than one per three module pages, or
no decision once the wiki has a dozen pages, is a wiki that only followed the folders:
say so, and propose the two or three that matter most. Then the next step, as a command
they can type: `wikipoke-ingest <largest cluster>` or `wikipoke-ingest "<a flow or
decision you named>"` for the next part, or `wikipoke-ingest all` to give every
remaining part its pass, whatever it costs.

## Notes

- On a large job, log what you deferred so it does not read as "covered everything".
- This never runs from a hook. The hooks only notify; a person launches this skill.
- wikipoke itself was upgraded? `wikipoke init` refreshes these skills and lists the
  hooks that are outdated. Updating a hook (`wikipoke hooks add <name>`) is the
  person's call: ask. Never copy templates by hand.
- Found a bug in the code? Note it on the page and tell the person. Don't fix it.
- Close by summarising **what the wiki now knows that it didn't**, not a file list.
