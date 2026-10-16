---
title: The three checks
type: entity
responsibility: What drift, coverage and lint each decide, and why all three are deterministic and read-only.
sources:
  - src/lib/drift.ts
  - src/lib/coverage.ts
  - src/lib/lint.ts
synced: d7a7356
sources_key: b1913551d0df
generated: { by: claude-code/claude-haiku-5-5, at: 2026-10-15T11:39:03Z }
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
`RepoAxis` (`src/lib/drift.ts:69`): its four states are a union rather than a `status` string
beside optional fields, so the two that know a commit count are the only two that can be asked for
one, and the report cannot print a count that was never computed. Two states carry one more field
each (`5054844`, `287f3c4`): `behind` and `current` may name a `fallback` commit to count from, and
`unknown-checkpoint` says `shallow` when the clone is shallow and cannot hold the commit at all.

**drift** asks whether the code moved past the wiki, on
[two axes at once](../concepts/two-axes-of-staleness.md). The repo axis compares HEAD against the
checkpoint; the page axis compares each page's `sources:` against its own `synced:`. A page with no
`sources:` or no `synced:` lands in `skipped[]` rather than in either bucket: it has no contract, so
it cannot be called fresh or stale (`src/lib/drift.ts:172`). It used to land there too when its
`synced:` was no longer a commit here. Since `942d6a6` such a page is judged by its `sources_key:`
([why](../decisions/content-key.md)) instead: drift hashes what the sources are now and says stale or fresh. That comparison cannot name
the files that moved, so the page has no `files[]` and no citations, and a page with neither a live
commit nor a usable key is still skipped. Diffs are cached per sha (`src/lib/drift.ts:143`), so a
wiki where most pages carry the same `synced:` runs one `git diff`, not one per page.

Drift also carries every citation through the diff to the line it names now, or reports it as
changed when a hunk rewrote the line itself (`src/lib/drift.ts:251`, `src/lib/drift.ts:305`). A
stale page lists them as `citations[]`; a fresh page whose pointers moved anyway lands in
`moved[]`. The first version (`aafa306`) looked only at stale pages and mapped from `synced:`, on
the theory that re-stamping was the last moment a move could be seen. Both halves were wrong in
practice. A page re-stamped without its pointers being moved is fresh, and an agent had done exactly
that to nine citations pushed between 56 and 286 lines down, with `lint` saying OK to all nine. And
`synced:` is not when a citation was written: a pointer into a file added after it, or one
re-pointed but not yet re-stamped, got moved a second time. Since `4943a76` each citation is dated
by the commit that last wrote its page line (`git blame`, `src/lib/drift.ts:276`), and a line not
committed yet counts as current. A checkpoint that is not a commit is printed in full
(`src/lib/drift.ts:363`), because the usual cause is a sha typed by hand whose first seven
characters are right, and seven characters that match HEAD read as a contradiction. The report
prints at most eight moved citations per page without `-v`, like the file list, because the
notifier puts it into an agent's prompt (`src/lib/drift.ts:408`).

A squash or rebase merge can throw away the commit a checkpoint names, and then drift counts from
a fallback instead (`src/lib/drift.ts:324`, `287f3c4`; [why](../decisions/checkpoint-fallback.md)). The fallback is the newest commit that
touched `.wikipoke-state.json`, and it stands in only when that commit wrote this same checkpoint.
In a shallow clone no commit stands in, and the report says to fetch the full history (`5054844`).
With `--against <ref>` (`0da6c99`, `b8ce2d1`) the diffs, the blame and the page are read from the
ref, not from the checkout.

Since `35f9c8a` drift also lists the decision notes waiting in `wiki/.inbox/` as `pending`
(`src/lib/drift.ts:140`). It counts files and never reads them — what a note says is for
`wikipoke-ingest` to judge — and like a stale page it is debt: one finding for `--strict`, silence
when the inbox is empty, never a failure. Under `--against` there are no pending notes, because no commit holds the inbox. It sits in drift rather than in a fourth check because
it is the same question, what the wiki owes, and the notifier already runs drift
([why the inbox exists](../decisions/capture-decisions.md)).

**coverage** is drift's mirror: tracked files, minus `.wikipokeignore`, that no page's `sources:`
claims. It groups what is left into clusters by folder so the backlog reads as "five files in
`src/lib/`" rather than a flat list (`src/lib/coverage.ts:29`). The subtlety is
`patterns.length ? … : indexable` (`src/lib/coverage.ts:27`): a wiki with no pages at all covers
nothing, rather than everything. It also reports how many files `.wikipokeignore` took out of the
total, because a rule that hides too much is otherwise invisible — the number is not a finding, so
it prints under the clusters and never breaks the report's silence when coverage is complete.
With `-v` each ignored path is printed as `ignored  <path>` and the count stays the last line
(`src/lib/coverage.ts:60`). Until `d3d5d3b` the ignored list came last with the same indent as the
uncovered one, and an agent that read `-v | tail` took the ignored tests for uncovered code and
spent fifteen calls reading wikipoke's own source to find out why.

**lint** is the only check that produces errors, and therefore the only one that can fail a plain
run. It decides the frontmatter contract (required keys, a `type:` that
[CONVENTIONS.md lists](../concepts/schema-lives-in-the-wiki.md), a `confidence:` from a fixed set,
a `synced:` that exists in git), that every `sources:` entry still matches a tracked file, and that
every Markdown link resolves — on pages, in `related:`, and in `index.md`, which is checked like a
page because a broken map is as bad as a broken page (`src/lib/lint.ts:104`).

A `synced:` that is gone is an error, unless the page carries a well-formed `sources_key:` that
still answers. Then it is a warning marked `squash` (`src/lib/lint.ts:137`), which fails nothing,
not even under `--strict` (`287f3c4`): a squash or rebase merge made it, not the wiki. A
`sources_key:` of the wrong shape is a warning too, since it answers nothing.

It also re-reads every `path:line` citation in a page's prose and warns when one now falls past
the end of its file, on a blank line, or on a line that only closes a block — `}`, `);`
(`src/lib/lint.ts:447`). Nobody cites a closing brace, so that one is almost always code that moved
underneath: it is the one post-hoc symptom of a shifted citation a machine can tell from real code,
and it catches some of what a reconcile re-stamped without re-pointing. A link that carries its
line twice, `[event.ts:41](…#L43)`, is also checked for the two agreeing (`src/lib/lint.ts:220`):
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
green by lying — a whole package, since `3eb714c` any source that claims more than half the
repository, and since `dc452c1` and `d63f692` more than fifty files, one source or a page's folders
counted together. Since `072403d` it also warns about a source on the "Never a source" list
CONVENTIONS.md owns — lock files and whatever the project adds, files that change with most commits
and so flag the page stale for work that has nothing to do with it (`src/lib/lint.ts:155`). Since
`d04d1a1` it warns about frontmatter a strict YAML parser reads differently from wikipoke's own
flat reader (`src/lib/lint.ts:302`): a `responsibility:` holding `: `, an unquoted value that opens
with a symbol. wikipoke reads those pages fine, but Obsidian, site generators and every YAML library
do not, and since `52980e2` the wiki is meant to be an Open Knowledge Format bundle other tools
read. Since `6f2b5f6` one frontmatter value is meant as a map rather than a string: a trust key,
`generated:` or `verified:`, opening with `{` (`src/lib/lint.ts:357`). There the check is not the
misread but the map's shape: one `{ by, at }` on its line, an actor OKF §7 names —
`<harness>/<model>`, `human:<id>` or `process:<id>` — and an ISO 8601 time with its offset
(`src/lib/lint.ts:363`). A `{` under any other key still gets the misread warning, because no other
template key may carry a map. In the same spirit it warns when `CONVENTIONS.md` has no frontmatter with a `type`
(`src/lib/lint.ts:91`) and when `log.md` is not newest first with one `## YYYY-MM-DD` heading per
day (`src/lib/lint.ts:396`); a log in the older one-heading-per-pass shape is named so the next
ingest rewrites it. All of these are warnings: what breaks is other tools, not wikipoke. Past 80 pages it warns once that reading `index.md` first has stopped ranking
anything — a deliberate nudge to reopen the "do we need search?" question rather than a measured
limit (`src/lib/lib.ts:186`).

Lint also reads `log.md` for the day of the newest `wikipoke-lint --deep` entry (`deepPass`,
`src/lib/lint.ts:264`). `check` and `check lint` print how long ago that was. The line fails
nothing, and `check drift` never prints it, so the notifier stays silent on a current wiki
(`d3356f0`, `7c0a39c`).
