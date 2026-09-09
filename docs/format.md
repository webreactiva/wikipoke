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

`wikipoke.uid` is stable across moves. Standard Markdown links create
`links_to` navigation edges. Typed relationships are explicit and directional
where their meaning requires it. Backlinks are derived rather than duplicated.
Sources create provenance edges.

Generated paths use readable slug segments with a short identity suffix, such as
`queries/how-are-payments-validated-5a1c2d3e.md`. Query pages retain their request ID, question, requested revision, attempts,
completion state, response, citations, and gaps in `wikipoke.query`. Decision
pages retain declared choice evidence and decision lifecycle in
`wikipoke.decision`. Watchlogs link their recorded decisions with the
`records` relationship. Missing rationale is represented as unknown.

The validator preserves unrecognized frontmatter fields and Markdown body text.
It rejects duplicate UIDs, evidence IDs that do not belong to the page's sources,
and replacement cycles. Broken cross-page links are warnings because imports can
legitimately refer to knowledge not yet written.
