---
title: The skills are the product
type: concept
responsibility: Why most of wikipoke's behaviour lives in Markdown templates that no code ever reads.
sources:
  - templates/skills/wikipoke-ingest/SKILL.md
  - src/lib/install.ts
synced: 3eb714c
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
as they are, never strings built in code (`src/lib/install.ts:81` is the entire rendering engine — one
`replaceAll` of `{{WIKI}}`). A skill kept as a string is a skill nobody diffs, nobody reviews as
prose, and nobody can open in the repository to see what their agent was told.

The trade is real. Prose cannot be unit-tested, and two agents will follow the same skill
differently. What the project does instead is make the *result* checkable: every page carries a
frontmatter contract, and `wikipoke check` decides mechanically whether the pages a skill produced
are sound, current and linked. The skill is free-form; its output is not.
