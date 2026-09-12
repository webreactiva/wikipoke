---
name: wikipoke-ingest
description: "Take code into the wiki. Seeds the wiki when it does not exist yet; reconciles it with what changed since the last checkpoint; or, given a path, ingests a part of the repository no pass has covered. Use when: (1) the user invokes /wikipoke-ingest, (2) the wiki notifier says the wiki is behind or code is uncovered, (3) the user says 'update the wiki', 'document <subsystem>', 'actualiza el wiki', 'crea el wiki', 'documenta <subsistema>', typically when closing a feature."
argument-hint: "[<path> | all]"
---
<!-- managed by wikipoke: `wikipoke init` rewrites this file. Project rules go in wiki/CONVENTIONS.md. -->

# wikipoke-ingest: take the code into the wiki

One verb, three ways in. Two are decided for you; the third is the one you aim.

```
argument given?
   │
   ├── yes ──► INGEST A PART   that path, whether or not it ever changed
   │           (`all` = the whole outstanding backlog)
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

1. **Record the base SHA:** `git rev-parse HEAD`. Short form for every page's
   `synced:`; full form for `last_indexed_commit`. Read `git log --oneline`: the
   history explains why the code looks like this and lives in no file.
2. **Survey without reading the sources.** `git ls-files`, the manifests, the
   READMEs and the project's agent instructions are enough to name the layers and
   the entry points. Source files come later, one page at a time.
3. **Tailor `wiki/.wikipokeignore`.** It starts generic. Add what in this repository is
   not code worth documenting: tests, fixtures, generated files, vendored code,
   build plumbing. Run `wikipoke check coverage` and read the clusters it lists to
   see what is left. Ignoring is a conscious call: say in the log what you ignored.
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
   what you actually read; never claim a whole package. Mark anything you
   reconstructed rather than read with `confidence: inferred`. Link only to pages
   that already exist.
7. **Write `index.md`** grouped by type, one line per page (its `responsibility`).
8. **Write `.wikipoke-state.json`** and the first `log.md` entry.

**Seeding stops at the avenues, on purpose**: the map, two or three flows, one page
per main subsystem — a dozen or so pages in a single package, one or two more per
workspace in a monorepo. Then let Mode C fill in the
neighbourhoods one at a time. Coverage will list exactly what you left, and that
list being long is fine: it is the backlog, not a failure.

---

## Mode B · RECONCILE (`.wikipoke-state.json` exists)

Reconcile, don't accumulate: the code moved, bring the pages back in line.

```
wikipoke check drift --json
   │  repo: commits since the checkpoint
   │  stale[]: pages whose sources moved past their own synced:
   ▼
   read ONLY each stale page's diff ──► rewrite the stale sections, re-stamp synced:
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
4. **New and moved code.** Changed files no page covers: propose a page, or leave
   them to coverage. Sources pointing at moved or deleted files: fix or retire the
   page.
5. **Refresh `index.md`** for any page added, retitled or with a new
   `responsibility`.
6. **Seal.** Append a `log.md` entry, then set `last_indexed_commit` in
   `.wikipoke-state.json` to `git rev-parse HEAD`, **only after the final check passes**.

---

## Mode C · INGEST A PART (an argument was given)

Aimed, not reactive. The target is a path (`src/billing`) or `all` for everything
still outstanding.

```
wikipoke check coverage -v   the backlog, grouped by folder
      │
      ▼
pick ONE cluster ──► read that code ──► write the pages it earns
      ▼
index.md · inbound links · log.md      (checkpoint untouched)
```

1. **Scope it.** With a path, work only inside it. With `all`, take the backlog from
   `wikipoke check coverage -v`, and read the warning below first.
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

> **One part per pass.** Ingesting `all` on a repository with a real backlog
> produces more pages than anyone will review, and an unreviewed page is worse than
> a missing one. If you do run it, say how many pages it produced and recommend
> reviewing them in batches.

---

## Every mode ends here

7. **Verify:** `wikipoke check`. Fix every error. Warnings about orphans, the index
   or over-broad sources are yours to fix too. Coverage and staleness left over are
   debt: report them, do not chase them in the same pass.

## Notes

- On a large job, log what you deferred so it does not read as "covered everything".
- This never runs from a hook. The hooks only notify; a person launches this skill.
- Found a bug in the code? Note it on the page and tell the person. Don't fix it.
- Close by summarising **what the wiki now knows that it didn't**, not a file list.
