---
title: The three checks
type: entity
responsibility: What drift, coverage and lint each decide, and why all three are deterministic and read-only.
sources:
  - lib/drift.mjs
  - lib/coverage.mjs
  - lib/lint.mjs
synced: 19b233f
related:
  - ./lib.md
  - ../concepts/two-axes-of-staleness.md
---

Three modules, one shape: `run(ctx)` returns a plain object, `report(result, opts)` prints it and
returns how many findings it printed. They share [lib/lib.mjs](./lib.md) for git, frontmatter and
globs, and they never call a model, never write, and never judge prose. What they cannot decide is
the `wikipoke-lint` skill's deep pass.

**drift** asks whether the code moved past the wiki, on
[two axes at once](../concepts/two-axes-of-staleness.md). The repo axis compares HEAD against the
checkpoint; the page axis compares each page's `sources:` against its own `synced:`. A page with no
`sources:`/`synced:`, or a `synced:` that is not a commit here, lands in `skipped[]` rather than in
either bucket: it has no contract, so it cannot be called fresh or stale
(`lib/drift.mjs:41`). Diffs are cached per sha (`lib/drift.mjs:27`), so a wiki where most pages
carry the same `synced:` runs one `git diff`, not one per page.

**coverage** is drift's mirror: tracked files, minus `.wikipokeignore`, that no page's `sources:`
claims. It groups what is left into clusters by folder so the backlog reads as "five files in
`lib/`" rather than a flat list (`lib/coverage.mjs:14`). The subtlety is
`patterns.length ? … : indexable` (`lib/coverage.mjs:12`): a wiki with no pages at all covers
nothing, rather than everything. It also reports how many files `.wikipokeignore` took out of the
total, because a rule that hides too much is otherwise invisible — the number is not a finding, so
it prints under the clusters and never breaks the report's silence when coverage is complete.

**lint** is the only check that produces errors, and therefore the only one that can fail a plain
run. It decides the frontmatter contract (required keys, a `type:` that
[CONVENTIONS.md lists](../concepts/schema-lives-in-the-wiki.md), a `confidence:` from a fixed set,
a `synced:` that exists in git), that every `sources:` entry still matches a tracked file, and that
every Markdown link resolves — on pages, in `related:`, and in `index.md`, which is checked like a
page because a broken map is as bad as a broken page (`lib/lint.mjs:59`).

It also re-reads every `path:line` citation in a page's prose and warns when one now falls past
the end of its file or on a blank line (`lib/lint.mjs:150`). It cannot know whether line 96 still
says what the page claims — that is the deep pass — but a file that lost forty lines it can see,
and that is the shape a citation usually rots into. Like staleness, a drifted pointer is debt: a
warning, never an error.

Its other warnings are about a wiki nobody can navigate rather than one that is malformed: orphan pages
(nothing links here), pages missing from `index.md`, `[[wikilinks]]` that this wiki does not
follow, and the [over-broad `sources:`](../concepts/over-broad-sources.md) that turn coverage
green by lying. Past 80 pages it warns once that reading `index.md` first has stopped ranking
anything — a deliberate nudge to reopen the "do we need search?" question rather than a measured
limit (`lib/lib.mjs:59`).
