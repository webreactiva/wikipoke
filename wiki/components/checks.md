---
title: The three checks
type: entity
responsibility: What drift, coverage and lint each decide, and why all three are deterministic and read-only.
sources:
  - src/lib/drift.ts
  - src/lib/coverage.ts
  - src/lib/lint.ts
synced: fa67d16
related:
  - ./lib.md
  - ../concepts/two-axes-of-staleness.md
---

Three modules, one shape: `run(ctx)` returns a plain object, `report(result, opts)` prints it and
returns how many findings it printed. They share [src/lib/lib.ts](./lib.md) for git, frontmatter and
globs, and they never call a model, never write, and never judge prose. What they cannot decide is
the `wikipoke-lint` skill's deep pass.

Since `df4db0e` each module also names the object it returns — `DriftResult`, `CoverageResult`,
`LintResult` — and those names are what let the CLI keep treating the three uniformly without
forgetting which is which (see [the entry point](./cli.md)). The most useful of them is drift's
`RepoAxis` (`src/lib/drift.ts:36`): its four states are a union rather than a `status` string
beside optional fields, so the two that know a commit count are the only two that can be asked for
one, and the report cannot print a count that was never computed.

**drift** asks whether the code moved past the wiki, on
[two axes at once](../concepts/two-axes-of-staleness.md). The repo axis compares HEAD against the
checkpoint; the page axis compares each page's `sources:` against its own `synced:`. A page with no
`sources:`/`synced:`, or a `synced:` that is not a commit here, lands in `skipped[]` rather than in
either bucket: it has no contract, so it cannot be called fresh or stale
(`src/lib/drift.ts:110`). Diffs are cached per sha (`src/lib/drift.ts:87`), so a wiki where most pages
carry the same `synced:` runs one `git diff`, not one per page.

Drift also carries every citation through the diff to the line it names now, or reports it as
changed when a hunk rewrote the line itself (`src/lib/drift.ts:137`, `src/lib/drift.ts:189`). A
stale page lists them as `citations[]`; a fresh page whose pointers moved anyway lands in
`moved[]`. The first version (`aafa306`) looked only at stale pages and mapped from `synced:`, on
the theory that re-stamping was the last moment a move could be seen. Both halves were wrong in
practice. A page re-stamped without its pointers being moved is fresh, and an agent had done exactly
that to nine citations pushed between 56 and 286 lines down, with `lint` saying OK to all nine. And
`synced:` is not when a citation was written: a pointer into a file added after it, or one
re-pointed but not yet re-stamped, got moved a second time. Since `4943a76` each citation is dated
by the commit that last wrote its page line (`git blame`, `src/lib/drift.ts:161`), and a line not
committed yet counts as current. A checkpoint that is not a commit is printed in full
(`src/lib/drift.ts:225`), because the usual cause is a sha typed by hand whose first seven
characters are right, and seven characters that match HEAD read as a contradiction. The report
prints at most eight moved citations per page without `-v`, like the file list, because the
notifier puts it into an agent's prompt (`src/lib/drift.ts:255`).

**coverage** is drift's mirror: tracked files, minus `.wikipokeignore`, that no page's `sources:`
claims. It groups what is left into clusters by folder so the backlog reads as "five files in
`src/lib/`" rather than a flat list (`src/lib/coverage.ts:29`). The subtlety is
`patterns.length ? … : indexable` (`src/lib/coverage.ts:27`): a wiki with no pages at all covers
nothing, rather than everything. It also reports how many files `.wikipokeignore` took out of the
total, because a rule that hides too much is otherwise invisible — the number is not a finding, so
it prints under the clusters and never breaks the report's silence when coverage is complete.

**lint** is the only check that produces errors, and therefore the only one that can fail a plain
run. It decides the frontmatter contract (required keys, a `type:` that
[CONVENTIONS.md lists](../concepts/schema-lives-in-the-wiki.md), a `confidence:` from a fixed set,
a `synced:` that exists in git), that every `sources:` entry still matches a tracked file, and that
every Markdown link resolves — on pages, in `related:`, and in `index.md`, which is checked like a
page because a broken map is as bad as a broken page (`src/lib/lint.ts:83`).

It also re-reads every `path:line` citation in a page's prose and warns when one now falls past
the end of its file, on a blank line, or on a line that only closes a block — `}`, `);`
(`src/lib/lint.ts:199`). Nobody cites a closing brace, so that one is almost always code that moved
underneath: it is the one post-hoc symptom of a shifted citation a machine can tell from real code,
and it catches some of what a reconcile re-stamped without re-pointing. A link that carries its
line twice, `[event.ts:41](…#L43)`, is also checked for the two agreeing (`src/lib/lint.ts:147`):
re-pointing the anchor and not the text is the usual way they part.

Both checks read citations in both forms agents write: `path:line` in prose, and a link into the
repository with a GitHub line anchor, `[event.ts](../src/core/event.ts#L12)`. The second form was
invisible until `3eb714c` — its link text names no path — and the first repository seeded after
the citation work wrote all 65 of its citations that way, so none of them had been checked by
anything. [The shared parser](./lib.md) reads both. It cannot know whether line 96 still
says what the page claims — that is the deep pass — but a file that lost forty lines it can see,
and that is the shape a citation usually rots into. Like staleness, a drifted pointer is debt: a
warning, never an error.

Its other warnings are about a wiki nobody can navigate rather than one that is malformed: orphan pages
(nothing links here), pages missing from `index.md`, `[[wikilinks]]` that this wiki does not
follow, and the [over-broad `sources:`](../concepts/over-broad-sources.md) that turn coverage
green by lying — a whole package, or since `3eb714c` any source that claims more than half the
repository. Past 80 pages it warns once that reading `index.md` first has stopped ranking
anything — a deliberate nudge to reopen the "do we need search?" question rather than a measured
limit (`src/lib/lib.ts:138`).
