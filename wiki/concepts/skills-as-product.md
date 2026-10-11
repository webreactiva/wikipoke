---
title: The skills are the product
type: concept
responsibility: Why most of wikipoke's behaviour lives in Markdown templates that no code ever reads.
sources:
  - templates/skills/wikipoke-ingest/SKILL.md
  - src/lib/install.ts
synced: ecc7b09
related:
  - ../components/skills.md
  - ../decisions/cli-read-only.md
---

Reading `src/lib/` tells you almost nothing about what wikipoke does. The three checks measure; the
installer copies files. The actual behaviour — what counts as a page, when to write one, what to
read first, when to stop — is prose in `templates/skills/*/SKILL.md`, executed by an agent.

That has a concrete consequence the project states as a rule in
[AGENTS.md](../../AGENTS.md): **new behaviour goes into a skill or into
`templates/CONVENTIONS.md` first**, and CLI code is added only for a check that is deterministic
and read-only. A feature that needs judgement is a paragraph, not a function.

It also explains a smaller rule that looks like style and is not: templates are plain files copied
as they are, never strings built in code (`src/lib/install.ts:104` is the entire rendering engine — one
`replaceAll` of `{{WIKI}}`). A skill kept as a string is a skill nobody diffs, nobody reviews as
prose, and nobody can open in the repository to see what their agent was told.

The trade is real. Prose cannot be unit-tested, and two agents will follow the same skill
differently. What the project does instead is make the *result* checkable: every page carries a
frontmatter contract, and `wikipoke check` decides mechanically whether the pages a skill produced
are sound, current and linked. The skill is free-form; its output is not. And the prose is measured
the only way prose can be: an agent follows it on a real repository and the pages, the answers and
the tokens are counted. The changes up to `78adf3b` came from four seed passes, a full `all` run and
several dozen timed questions against a 1,480-file Laravel app, each one a sentence rewritten after
a run showed an agent reading it the wrong way.

The prose starts working before the skill is read, too: a skill's `description:` is all an agent
sees when it decides whether to reach for one. The query skill's first description fired on "how
does X work" and "where does Y live", and an agent with the wiki installed opened it in 3 of 9
runs on one repository. Widened to any question about how the code behaves (`34f14a3`), it was
opened in 9 of 9.

The decision capture of `e52be54` is the rule applied end to end. Which decisions are worth a page
is a judgement, so it is a section of `CONVENTIONS.md` that four pieces of prose point at — the
`decisions` block in `AGENTS.md`, `wikipoke-implement`, the ingest's drain and, since `3e94960`,
`wikipoke-decision` — and the only code it got is what a machine can decide: drift counts the
notes, and `hooks add decisions` checks that the section's heading exists. The bar starts strict,
and a project moves it by editing a sentence
([the decision](../decisions/capture-decisions.md)).

Issue #19 proved the rule again from the opposite side: where code had to change, it changed by one
name in one array. `wikipoke-decision` is 133 lines of Markdown shipped in `3e94960`, and all it
took in `src/` was joining the `SKILLS` list the installer copies (`src/lib/install.ts:25`).
Everything else — the new skill, the decision-page keys added to the schema, the `planned:` lens in
lint — is prose in files the project can diff;
[the skills page](../components/skills.md) carries the detail.

Issue #20 is the limit case: a behaviour change with no line of `src/` at all. How a page type says
what goes in it — "Where each type comes from" in `CONVENTIONS.md`, read by the ingest to write and
seed pages of a type the project added, by lint to ask for that type's missing page, and by query to
pick the type of an answer offered to file — shipped in `ecc7b09` as prose pointing at prose: a
section the project owns, three skills that read it, and no code beyond the checker that already read
the types table.
