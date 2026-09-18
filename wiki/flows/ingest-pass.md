---
title: An ingest pass
type: flow
responsibility: The loop a person and an agent run to seed, reconcile or extend the wiki, and where the checkpoint moves.
sources:
  - templates/skills/wikipoke-ingest/SKILL.md
  - templates/CONVENTIONS.md
synced: 87d9fd0
trigger: a person launching /wikipoke-ingest, often after the notifier said the wiki is behind
related:
  - ../architecture.md
  - ../components/skills.md
  - ../concepts/two-axes-of-staleness.md
---

Nothing in this flow is code. A person launches the skill, an agent follows it, and the only
program involved is `wikipoke check`, which measures and then gets out of the way.

```
person: /wikipoke-ingest [<path> | all]
   │
   ├─ argument?  ── yes ─────────────────────────────► C · INGEST A PART
   │                                                    coverage -v → pick ONE cluster
   └─ no ── .wikipoke-state.json exists?
              ├─ no  ─► A · SEED        survey → ignore list → architecture.md → avenues
              └─ yes ─► B · RECONCILE   drift --json → read each stale page's own diff
                                         → re-point its citations[] and re-stamp, in one edit
   │
   ▼
write pages under wiki/  ·  index.md  ·  log.md entry
   │
   ▼
wikipoke check  ── errors? ─► fix, re-run
   │
   ▼
checkpoint: Mode A and B write last_indexed_commit = HEAD, by printf, never by hand.
            Mode C never touches it.
```

## Seeding stops at the avenues

A seed writes the map, two or three flows and one page per subsystem — a dozen or so pages — and
then stops, on purpose. The alternative produces a hundred pages nobody reviewed, which is worse
than the gap it closed, and coverage will list exactly what was left as
[the backlog](../concepts/coverage-as-debt.md). The order inside a seed is also fixed:
`architecture.md` is written *from the survey*, before any source file is read, and corrected later
as the other pages teach the agent more. Anything reconstructed rather than read is marked
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
skipped one and a re-pointed one is never moved twice.

Nothing stale and the repository current is a complete outcome: say so and stop.

## Why only two modes move the checkpoint

`last_indexed_commit` means "every commit up to here is reflected in the wiki". Seeding and
reconciling earn that claim; ingesting a part does not — it closes a coverage gap, which says
nothing about the commits since the checkpoint. Query and lint never move it either. And it moves
**after** the final check passes, never before, so a checkpoint never vouches for a wiki that does
not lint.

It is written by a command — `printf` around `git rev-parse HEAD` — and never typed. An agent that
typed it kept the first seven characters of the sha and invented the other thirty-three, which
`check` caught as a broken checkpoint; the skills now leave no sha for the agent to copy.
