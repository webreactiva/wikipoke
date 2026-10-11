---
title: An ingest pass
type: flow
responsibility: The loop a person and an agent run to seed, reconcile or extend the wiki, and where the checkpoint moves.
sources:
  - templates/skills/wikipoke-ingest/SKILL.md
  - templates/CONVENTIONS.md
synced: 7526c5e
generated: { by: opencode/glm-5.3-flash, at: 2026-10-11T01:13:36Z }
trigger: a person launching /wikipoke-ingest, often after the notifier said the wiki is behind
related:
  - ../architecture.md
  - ../components/skills.md
  - ../concepts/two-axes-of-staleness.md
---

Nothing in this flow is code. A person launches the skill, an agent follows it, and the only
program involved is `wikipoke check`, which measures and then gets out of the way.

```
person: /wikipoke-ingest [<path> | <topic> | all]
   │
   ├─ wiki/.inbox/ holds notes? ─► DRAIN: bar again → check against the code → decision page
   │                                       → delete the note       (a seed: after its avenues)
   │
   ├─ argument?  ── yes ─────────────────────────────► C · INGEST A PART
   │                                                    a path: coverage -v → pick ONE cluster
   │                                                    a topic: its entry point or its history
   │                                                    all: every cluster, one pass each
   └─ no ── .wikipoke-state.json exists?
              ├─ no  ─► A · SEED        survey → ignore list → architecture.md → avenues
              └─ yes ─► B · RECONCILE   drift --json → read each stale page's own diff
                                         → re-point its citations[] and re-stamp, in one edit
   │
   ▼
write pages under wiki/  ·  index.md  ·  log.md entry (newest first, one ## YYYY-MM-DD per day)
   │
   ▼
wikipoke check  ── errors? ─► fix, re-run
   │
   ▼
close: coverage in numbers · pages by type · flows and decisions left · the next command
   │
   ▼
checkpoint: Mode A and B write last_indexed_commit = HEAD, by printf, never by hand.
            Mode C never touches it.
```

## The inbox goes first

Since `e52be54` a pass starts with the decision notes an agent left in `wiki/.inbox/` while
implementing, because they are the only place the discarded alternative survives and they live in
one working copy. Each is judged against the project's "Decisions worth recording" bar a second
time, one decision at a time when a note bundles several, read against the files it names, and turned into a new decision page, an extension or a
supersede — the old page gaining `status: deprecated` once the code follows the new one, and
staying in force with a "will reverse" line while the reversal is still planned; then it is
deleted, right after its page, so a pass cut short never integrates one twice.
A note about uncommitted code waits for a commit, because `synced:` has to name one. A seed drains
after its avenues, so the decision pages have something to link to. What was dropped is said in the
log and in the close ([the decision](../decisions/capture-decisions.md)).

## Seeding stops at the avenues, and says so

A seed writes the map, two or three flows and one page per subsystem — a dozen or so pages — and
then stops, on purpose. The alternative produces a hundred pages nobody reviewed, which is worse
than the gap it closed, and coverage will list exactly what was left as
[the backlog](../concepts/coverage-as-debt.md). The order inside a seed is also fixed:
`architecture.md` is written *from the survey*, before any source file is read, and corrected later
as the other pages teach the agent more. Since `ecc7b09` the avenues include any type the project
added: what such a page holds comes from its entry under "Where each type comes from" in
`CONVENTIONS.md` (`templates/skills/wikipoke-ingest/SKILL.md:164`) — the skill's own table is only
the fallback for a copy installed before the section, and a type neither the section nor the table
answers is written as no page at all, said in the report. Anything reconstructed rather than read is marked
`confidence: inferred`, and since `aafa306` it carries no `path:line` either: a seed on a real
repository wrote a page about a directory it never opened and cited a line in it, which landed on
unrelated code and passed every check. Only a file opened in the pass may be cited, and only a file
opened in the pass goes in `sources:` (`3eb714c`): a file merely named belongs to the backlog, and
claiming it takes it off the list the next pass reads.

Seeding also tailors `.wikipokeignore` in both directions, which is the step most easily done
half-way. The starting list ignores `*.md`, and in a repository whose product is prose — prompts,
skills, agent instructions, a spec — that hides exactly what should be documented; a `!` line
brings it back. This wiki is the case in point: the three `SKILL.md` files and `CONVENTIONS.md`
under `templates/` are most of what wikipoke is, and the generic rule had hidden all four.

Choosing `sources:` follows one more list since `072403d`: the "Never a source" files in
`CONVENTIONS.md`, lock files by default, which change with most commits and would mark a page stale
for work that has nothing to do with it. A page cites the files its claim rests on instead.

The rule that makes a seed finish at all is **write as you go**: read what one page needs, write
that page, move on. Reading the whole repository first is paid for twice, once now and again after
it has been forgotten.

## Reconciling reads diffs, not the repository

Mode B never re-reads the code. `wikipoke check drift --json` names the stale pages, and each one
is reconciled from `git diff <its synced> HEAD -- <its sources>` — its own diff, nothing else. Only
the stale sections are rewritten, so hand-written notes survive, and when a change *contradicts*
what the page claimed, the page says what it used to be and what changed it, with the SHA. That
sentence is the part git tells badly, and it is most of why the wiki is worth keeping.

Each stale page also comes with `citations[]`, the pointers the code moved since they were
written: the line each one names now, or `null` when the diff rewrote the cited line itself, which
means reading the code again. Pages that are fresh but whose pointers moved anyway come in
`moved[]` — usually a page an earlier pass re-stamped without re-pointing — and are fixed the same
way. Both are re-pointed before the re-stamp, though since `4943a76` the order is no longer what
keeps them honest: each citation is dated by the commit that wrote it, so a re-stamp cannot hide a
skipped one and a re-pointed one is never moved twice. Since `7526c5e` the re-stamp also names its
kind: `generated:` on a page whose claims the diff forced to be rewritten, `verified:` on one that
was still true (`templates/skills/wikipoke-ingest/SKILL.md:244`).

Reconcile, since `9c722ab`, also reads every `planned: true` decision page against the commits
since the checkpoint, stale or not, because the code that carries a plan out can land in a file
the page does not cite — staleness is the only signal that could ever fire there. Where the diff
carries the plan out, the ingest drops the key, adds the files that now carry the decision to
`sources:`, and marks the page it supersedes `status: deprecated`, its opening line turned from
"will reverse" into "reversed" (`d34957f`).

Nothing stale and the repository current is a complete outcome: say so and stop.

Every pass writes its entry the Open Knowledge Format way since `52980e2`: `log.md` newest first,
one `## YYYY-MM-DD` heading per day, each pass a `* **<skill>**: …` entry at the top of its day. A
log still in the older one-heading-per-pass shape is rewritten first, never changing what an old
entry says (`62cc97d`).

## A pass ends by saying what it left

A seed that stops at the avenues is only honest if it says so. Since `3f36deb` every mode closes by
running coverage and telling the person, in numbers, how much of the code the wiki now claims, the
largest clusters left, what the ignore list hides, and the command to type next; since `da8898c`
it also counts the pages by type and names the flows and decisions it saw and did not write. Both
came from runs on a 1,480-file Laravel app: the first seed reported six pages as "the wiki", and
four passes that followed coverage produced twenty-three module pages, two flows and no decision.
Coverage counts files, so it only ever asks for module pages; flows start at an entry point and
decisions in `git log`, and the close is where the agent says so and proposes them by name.

## `all` ends when every part had its pass

`all` first meant "until coverage prints nothing". On the Laravel app that zero was out of reach
honestly — it means reading every file — and the agent reached it anyway, by rewriting the sources
of ten pages it had written into whole folders it had only listed classes from; even after lint
began warning past fifty files it split one folder into eight subfolders under the limit. `all` now
gives every cluster one pass and one `log.md` entry, and ends when every cluster has its entry and
the flows and decisions the loop cannot see are written. The entries are also how a run cut short
resumes: the next `all` takes the clusters without one. What was not read stays in coverage.

## Why only two modes move the checkpoint

`last_indexed_commit` means "every commit up to here is reflected in the wiki". Seeding and
reconciling earn that claim; ingesting a part does not — it closes a coverage gap, which says
nothing about the commits since the checkpoint. Query and lint never move it either. And it moves
**after** the final check passes, never before, so a checkpoint never vouches for a wiki that does
not lint.

It is written by a command — `printf` around `git rev-parse HEAD` — and never typed. An agent that
typed it kept the first seven characters of the sha and invented the other thirty-three, which
`check` caught as a broken checkpoint; the skills now leave no sha for the agent to copy.
