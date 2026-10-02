---
title: Decisions are captured while code is written, against one bar the project owns
type: decision
responsibility: Why agents note decisions in an uncommitted inbox as they implement, why one strict, editable section of CONVENTIONS.md decides which ones count, and why the hook that asks for them is not a notifier.
sources:
  - templates/CONVENTIONS.md
  - templates/agents-decisions.md
  - templates/skills/wikipoke-implement/SKILL.md
  - templates/skills/wikipoke-ingest/SKILL.md
  - src/lib/install.ts
  - src/lib/drift.ts
synced: ee3921c
reversible: true
related:
  - ./notify-never-write.md
  - ../components/hooks.md
  - ../components/skills.md
  - ../concepts/schema-lives-in-the-wiki.md
---

**Decision.** The reason behind a choice is lost the moment the code is written: the commit keeps
the result, a squash merge drops even the commit, and an ingest days later finds "decisions: none".
So the agent that writes the code jots the decision down while it still knows what it discarded,
and the next `wikipoke-ingest` turns the note into a page. Two ways in, neither the default: the
`decisions` hook puts a block in `AGENTS.md` that asks every agent for notes
(`templates/agents-decisions.md`), and the `wikipoke-implement` skill does it for one piece of work,
only when a person names it. Introduced in issue #18 (`35f9c8a`, `e52be54`).

## One bar, strict, in the project's CONVENTIONS.md

Which decisions count is written once, in the section "Decisions worth recording"
(`templates/CONVENTIONS.md:173`), and the hook, `wikipoke-implement` and the ingest's drain all
point at it instead of carrying their own wording. The default is the strict one: a runtime
dependency, an architectural pattern, or a choice hard to reverse
(`templates/CONVENTIONS.md:183`), never routine fixes, linter preferences or what the code already
says. A project widens or narrows it by editing its copy, as it already does with the page types;
a wider variant waits in an HTML comment marked "Not in force" (`templates/CONVENTIONS.md:193`).

**Discarded: record every decision.** It was the first of two ways the course this came from asks
for ADRs, and the one that fills a folder with notes on every small choice. More documentation
buries the few decisions that matter and soon contradicts the code; the bar keeps only what the
code cannot say, which is the wiki's own rule. **Discarded: a CLI setting.** The bar is prose an
agent applies, not something the CLI could check, and the CLI only measures.

A schema older than the section has no bar to read. `hooks add decisions` says so and names the
template (`src/lib/install.ts:316`), and the hook and both skills tell the agent to record nothing
until it is added rather than invent one.

## An uncommitted inbox, counted as debt

Notes go to `wiki/.inbox/`, one file each, named by date so two branches never collide. The folder
holds a `.gitignore` of `*` that ignores itself too (`src/lib/install.ts:76`), so a project never
touches its own ignore list, and in a fresh clone the agent that writes the first note recreates
it; a bare `*` written that way counts as wikipoke's (`src/lib/install.ts:80`). Being a dot folder,
it is never walked as pages, and the wiki stays an OKF bundle. `check drift` lists the notes as
`pending` (`src/lib/drift.ts:92`): debt like a stale page, never a reason for a plain run to fail,
and invisible to CI since the folder is never committed.

**Discarded: committing the notes.** That would put scratch work in git and give decisions a second
place to live; the only lasting place is a decision page written by `wikipoke-ingest`, which checks
the note against the code, applies the bar again and deletes it. The price, accepted: notes live
only in the working copy that wrote them, so they must be integrated before a branch or worktree
goes away.

## The hook that asks is not a notifier

`decisions` is a hook in the same table as the others, but it runs no
[notifier](./notify-never-write.md): it asks agents to write notes and says nothing itself.
`NOTIFIES` (`src/lib/install.ts:89`) keeps it from installing `.wikipoke-hook.sh`
(`src/lib/install.ts:382`) and from counting as the hook that keeps the notifier alive
(`src/lib/install.ts:391`). Alone, it tells nobody the wiki is behind, so it is meant to be paired
with one that does. Removing it keeps the inbox's ignore file while anything else is still in the
folder, so waiting notes never reach git (`src/lib/install.ts:338`).
