---
title: The schema lives in the wiki
type: concept
responsibility: Why CONVENTIONS.md, a file the project owns and edits, is the authority the checks read from.
sources:
  - templates/CONVENTIONS.md
  - src/lib/lib.ts
synced: 1097b15
related:
  - ./file-ownership.md
  - ../components/checks.md
---

`wiki/CONVENTIONS.md` is copied in once and then belongs to the project. It states the page types,
the template, the writing rules and the checkpoint contract, and its opening paragraph settles the
question of authority outright: when the skills or the checks disagree with it, **this file wins**.
`src/lib/lib.ts` repeats the same rule in its own header, aimed at whoever edits the checks next.

That is not only a documentation convention — one part of it is wired up. `pageTypes()` reads the
valid `type:` values out of the first column of the page-types table in `CONVENTIONS.md`
(`src/lib/lib.ts:304`), falling back to the defaults only when the file or the table is missing. A
project adds a page type by adding a table row to a file it owns; nothing is recompiled and nothing
is configured. Retiring a type is deleting the row, after which lint reports every page still
carrying it.

Two more sections are read the same way. Since `072403d` lint takes the files it warns about as
sources from the "Never a source" list (`src/lib/lib.ts:352`): lock files by default, plus whatever
the project adds, and an empty list switches the warning off. And since `e52be54` the
"Decisions worth recording" section is the bar for which decisions agents capture while they
implement and ingest turns into pages; no code reads it, the `decisions` hook, `wikipoke-implement`
and `wikipoke-ingest` all point at it, and `hooks add decisions` only checks that the heading
exists ([the decision](../decisions/capture-decisions.md)). It starts strict, and widening it is
an edit to this file, which is the whole argument for putting it here.

Since `3e94960` the section carries two more rules of that kind. It states who the bar governs: a
decision a person asks to keep, through `wikipoke-decision`, is the person's to judge, because a
bar is for what an agent writes down on its own. And its "On the page" part is the specification
the decision pages follow — `decided_by:` only when known first hand, `planned: true` while the
code has yet to follow, `status: deprecated` once another decision reverses it and the code
complies — every key of it prose, and every key of it owned by this file.

Since `52980e2` the file also opens with a two-line frontmatter, `type: schema`, so the wiki reads
as an Open Knowledge Format bundle; lint warns when it is missing, and `init` names it first among
what an older copy should carry over.

The rest of the schema — the five required keys, the two `confidence:` values — is still constants
in `src/lib/lib.ts`. The direction is clear from the types table, and where the file cannot be read
the defaults keep the checks working rather than failing closed.

The reason to put the schema *in* the wiki rather than in the tool is that the skills read it
before writing anything. A project that documents in Spanish, adds a `runbook` type or forbids
ASCII diagrams changes one Markdown file, and the agent follows the change on its next pass —
without a wikipoke release, and without the tool having to anticipate what any project wanted.

The writing rules are where a measured failure goes. One page explained two cases in one
paragraph, and agents answering from it merged them in four of six runs; `34f14a3` added "one case,
one sentence, with its outcome" to the template, and the same page rewritten that way was read
right six times out of six.

The price is that a new wikipoke cannot hand the file its new rules. Since `87d9fd0` it at least
says so: `init` names the template when the project's copy differs from it, and the project decides
what to carry over. This repository's own copy had fallen behind three times before that.
