---
title: The schema lives in the wiki
type: concept
responsibility: Why CONVENTIONS.md, a file the project owns and edits, is the authority the checks read from.
sources:
  - templates/CONVENTIONS.md
  - lib/lib.mjs
synced: 68c8fa3
related:
  - ./file-ownership.md
  - ../components/checks.md
---

`wiki/CONVENTIONS.md` is copied in once and then belongs to the project. It states the page types,
the template, the writing rules and the checkpoint contract, and its opening paragraph settles the
question of authority outright: when the skills or the checks disagree with it, **this file wins**.
`lib/lib.mjs` repeats the same rule in its own header, aimed at whoever edits the checks next.

That is not only a documentation convention — one part of it is wired up. `pageTypes()` reads the
valid `type:` values out of the first column of the page-types table in `CONVENTIONS.md`
(`lib/lib.mjs:148`), falling back to the defaults only when the file or the table is missing. A
project adds a page type by adding a table row to a file it owns; nothing is recompiled and nothing
is configured. Retiring a type is deleting the row, after which lint reports every page still
carrying it.

The rest of the schema — the five required keys, the two `confidence:` values — is still constants
in `lib/lib.mjs`. The direction is clear from the types table, and where the file cannot be read
the defaults keep the checks working rather than failing closed.

The reason to put the schema *in* the wiki rather than in the tool is that the three skills read it
before writing anything. A project that documents in Spanish, adds a `runbook` type or forbids
ASCII diagrams changes one Markdown file, and the agent follows the change on its next pass —
without a wikipoke release, and without the tool having to anticipate what any project wanted.
