---
type: decision
title: Reconcile documentation without rewriting historical knowledge
description: Reconcile documentation without rewriting historical knowledge
sources:
  - id: src/wiki.ts
    revision: 1857c8217308
    hash: 0106367da489604e
  - id: src/knowledge.ts
    revision: 1857c8217308
    hash: d1a44099c56b5dfd
  - id: src/integrations.ts
    revision: 1857c8217308
    hash: a6320c2d55b85a25
wikipoke:
  uid: decision:d33fde72e6b17dbe0a0b3b3999c531eefdc7c40c5199f953c85897631a4c3708
  relations: []
  decision:
    actor: agent/codex
    eventId: reconciliation-and-editorial-guidance-2026-09-10
    at: 2026-09-10T12:00:00Z
---
# Choice

Queue outdated documentation alongside uncovered sources, expose deleted references and structural findings, and require those conditions to clear before reporting completion. Surface historical query and decision drift for explicit review instead of automatically rewriting records. Count distinct files matched by source patterns in quality heuristics. Guide agents to understand the project and reader questions before publishing pages.

# Declared rationale

Daniel authorized robustness and output-quality improvements before testing on a real project. Inspection found that ingest could report completion with outdated pages, and pattern strings bypassed file-count heuristics. Historical choices and answers describe what was recorded then; rewriting them just to clear drift would change that record. Mechanical checks cannot establish factual or editorial quality, so project-level orientation remains the host agent's responsibility.

# Capture provenance

Generated with `wikipoke capture` in an isolated local clone because this checkout
has no initialized wiki. Evidence pins the committed code inspected when making
the choice, before implementation. The generated decision was retained here;
no wiki installation or hooks were added to this project.
