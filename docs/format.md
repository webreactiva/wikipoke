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
    resource: src/payments/gateway.ts
    revision: 0123456789abcdef
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

The gateway sends validated payment requests.
```

A source record holds only `id`, `resource`, `revision`, `hash`, and an optional
`title`. Source text is never part of a page: the `content` field carried by an
`ingest` plan is dropped on publication, so a patch may reuse the plan's
`sources` array verbatim without spilling code into the wiki.

`wikipoke.uid` is stable across moves. Standard Markdown links create
`links_to` navigation edges. Typed relationships are explicit and directional
where their meaning requires it. Backlinks are derived rather than duplicated.
Sources create provenance edges.

Generated paths use readable slug segments with a short identity suffix, such as
`queries/how-are-payments-validated-5a1c2d3e.md`. Every path segment must be a
lowercase hyphenated slug. Query pages retain their request ID, question,
requested revision, attempts, completion state, response, citations, and gaps in
`wikipoke.query`. A query's state is exactly one of `pending`, `unsupported`, or
`answered`; `answered` is terminal and cannot be replaced, while the other two
still accept a further answer. Every attempt, including a rejected one and its
reason, stays in `attempts` and in the page body. Decision pages retain declared choice evidence and decision
lifecycle in `wikipoke.decision`. Watchlogs link their recorded decisions with
the `records` relationship. Missing rationale is represented as unknown.

`wiki/index.md` is generated on every publication; hand edits to it are
replaced. `index.md` and `log.md` are reserved at the wiki root only, because
that is where Wikipoke generates them, and a patch claiming either is rejected.
Deeper in the tree the names carry no meaning: `entities/index.md` is an
ordinary page that publishes, counts, lints, joins the graph, and appears in the
generated index like any other. A nested file with one of those names and no
valid frontmatter is therefore an `invalid-page` error, not a silently ignored
file.

The validator preserves unrecognized frontmatter fields and Markdown body text.
It rejects duplicate UIDs, evidence IDs that do not belong to the page's sources,
and replacement cycles. A page that cannot be parsed at all — malformed
frontmatter, or none — is reported as an `invalid-page` error rather than
failing the whole run, and publication refuses to overwrite it, naming the file
and the reason it could not be read. An error finding does not stop other pages
from being published, but it does hold back `seal`. Symlinks inside
the wiki are not read as pages and cannot be published over. Broken cross-page
links are warnings because imports can legitimately refer to knowledge not yet
written.
