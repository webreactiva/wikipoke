---
title: The skills are the product
type: concept
responsibility: Why most of wikipoke's behaviour lives in Markdown templates that no code ever reads.
sources:
  - templates/skills/wikipoke-ingest/SKILL.md
  - src/lib/install.ts
synced: 78adf3b
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
as they are, never strings built in code (`src/lib/install.ts:85` is the entire rendering engine — one
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
