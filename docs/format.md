# Knowledge format

Wikipoke pages are UTF-8 Markdown with YAML frontmatter. They follow the OKF
card conventions used by the source wikis: a required `type`, Markdown body,
and structured source records. Nonstandard data lives in the `wikipoke`
extension namespace. This is format compatibility, not a claim of validation
or certification by an external OKF validator.

```markdown
---
type: entity
title: Payment gateway
description: Sends validated payment requests to the configured provider.
sources:
  - id: src/payments/gateway.ts
    revision: 0123456789ab
    hash: 0123456789abcdef
wikipoke:
  uid: payment-gateway
  relations:
    - type: depends_on
      target: /entities/http-client.md
      evidence: [src/payments/gateway.ts]
      basis: observed
---

# Behavior

The gateway sends validated payment requests through
[the HTTP client](./http-client.md), retrying under [[concepts/backoff]].
```

A source record holds only `id`, `resource`, `revision`, `hash`, and an optional
`title`. Source text is never part of a page: the `content` field carried by an
`ingest` plan is dropped on publication, so a patch may reuse the plan's
`sources` array verbatim without spilling code into the wiki.

A source carries `id` and, when it differs from the id, `resource`; with the Git
adapter they are the same path, so only `id` is written. `hash` and `revision`
are abbreviated: they answer "same content, same commit" and nothing else, and
both are compared by prefix, so a wiki written by an earlier release keeps
validating against a newer one instead of reporting every page as drifted.

`wikipoke.uid` is stable across moves. Standard Markdown links create
`links_to` navigation edges. Typed relationships are explicit and directional
where their meaning requires it. Backlinks are derived rather than duplicated.
Sources create provenance edges.

Generated paths are readable slugs — `queries/how-are-payments-validated.md` —
with a numeric suffix only when that name is already taken. A page's identity is
`wikipoke.uid`, never its path, so a page that is already published keeps the
name it has and is never renamed underneath the links that point at it. Every
path segment must be a lowercase hyphenated slug. Query pages retain their request ID, question,
requested revision, attempts, completion state, response, citations, and gaps in
`wikipoke.query`. A query's state is exactly one of `pending`, `unsupported`, or
`answered`; `answered` is terminal and cannot be replaced, while the other two
still accept a further answer. Every attempt, including a rejected one and its
reason, stays in `attempts` and in the page body. Decision pages retain declared choice evidence and decision
lifecycle in `wikipoke.decision`. Missing rationale is represented as unknown.

A decision's declared evidence is resolved against the inventory and becomes
real provenance in `sources`, pinned at the hash the code had when the choice was
made — so a decision drifts when the code behind it moves, and evidence naming a
file outside scope stays in the body as declared and unverified. The page then
links, in its body, to the pages documenting that same code and to the other
choices recorded under the same task. A decision never counts towards coverage:
it cites the code it was about, not the code it documents.

Coverage is set membership — a source is covered when some page cites it with a
matching hash — and citing costs nothing, so one page of one sentence citing
every file reports a fully covered wiki. `lint` reports `thin-coverage` for a
page claiming three or more sources in less than twenty-five characters of body
per source, and `seal` refuses while any page does. The threshold is calibrated
against real wikis: the thinnest genuine page spends 120 characters per source
and the most source-heavy index page 32, while the degenerate case spends one.

An answer may cite a source id or the path of a page. Source ids pin provenance
in `sources`; a cited page is linked from the body under "Answered from".

**Connections between pages are links in the body, not typed relations.** A link
is something a reader can follow and something Obsidian, GitHub and the graph all
understand, while a relation in frontmatter is visible only to `graph`. Wikipoke
writes ordinary relative Markdown links and reads `[[wikilinks]]` as well,
resolved the way Obsidian resolves them: `[[folder/note]]` from the wiki root and
`[[note]]` by name across the wiki, with an ambiguous name resolving to nothing.
Brackets inside code are code.

`wikipoke.relations` remains for the three relationships a link cannot express,
each one read by something: `depends_on` widens the planning context and is
checked for cycles, `supersedes` orders replacements and is checked for cycles,
and `related_to` is the symmetric catch-all — the graph stores one edge per
symmetric pair and names those types in its `symmetric` field. Wikipoke itself
writes none of them.

A page whose `type` is `flow` describes an end-to-end sequence rather than a unit
of code: it cites every source the sequence crosses and explains why the steps
are ordered as they are. `lint` reports `no-flows` while a wiki describes code
and no page describes a path through it, and `thin-flow` for a flow resting on
fewer than two sources. Nothing else raises that gap, because a missing flow
leaves no source uncovered.

`wiki/index.md` and `wiki/log.md` are generated on every publication; hand edits
to either are replaced. The index carries knowledge; the log carries chronology —
one entry per recorded decision, newest first, naming the files the decision
claims. `index.md` and `log.md` are reserved at the wiki root only, because
that is where Wikipoke generates them, and a patch claiming either is rejected.
Deeper in the tree the names carry no meaning: `entities/index.md` is an
ordinary page that publishes, counts, lints, joins the graph, and appears in the
generated index like any other. A nested file with one of those names and no
valid frontmatter is therefore an `invalid-page` error, not a silently ignored
file.

`lint` reports, beyond the structural errors below: `no-flows` and `thin-flow`
for the flow pages a wiki is missing or leaning on one source;
`thin-coverage` for a page claiming more sources than it describes;
`mirrors-the-tree` for a wiki with about one page per source file;
`dependency-cycle` for circular `depends_on`; `replacement-cycle` for circular
`supersedes`; `broken-link` for a link to a page that is not there;
`unknown-evidence` for a relation citing evidence outside the page's own sources;
`duplicate-id` for two pages sharing a `wikipoke.uid`; `conflict-markers` for a
page a merge left unresolved; and `lost-checkpoint` when the sealed commit is no
longer in the repository. `seal` is held by every error, and by `no-flows`,
`thin-coverage` and `mirrors-the-tree` — the three warnings that describe a wiki
which looks complete and is not.

The validator preserves unrecognized frontmatter fields and Markdown body text.
It rejects duplicate UIDs, evidence IDs that do not belong to the page's sources,
and replacement cycles. A page that cannot be parsed at all — malformed
frontmatter, or none — is reported as an `invalid-page` error rather than
failing the whole run, and publication refuses to overwrite it, naming the file
and the reason it could not be read. One case is separated out: a page carrying
unresolved merge conflict markers is a `conflict-markers` error, and publication
*is* allowed to overwrite it. Git wrote those markers, nobody is midway through
editing that file, and refusing to publish leaves the only repair to a human
editing YAML by hand. An error finding does not stop other pages
from being published, but it does hold back `seal`. Symlinks inside
the wiki are not read as pages and cannot be published over. Broken cross-page
links are warnings because imports can legitimately refer to knowledge not yet
written.
