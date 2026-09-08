---
slug: wikipoke
size: standard
phase: build
tracker: null
branch: main
opened: 2026-09-08
---

# Wikipoke cycle

## Current position

The Standard cycle begins with design. Intent is folded into the Problem
section of [spec.md](./spec.md); no separate Plan-phase artifact or approval
is claimed. Daniel accepted the design on 2026-09-08. The cycle is now preparing
the implementation plan; the human build gate remains open. No code may be
implemented on the strength of design acceptance alone.

The [proposal](../../PROPUESTA.md) predates this cycle. It records product
discussion and suggested architecture, not an approved implementation plan.
Initial repository commit: `7c82ed9`. No application code exists yet.

## Configuration decision

On 2026-09-08, Daniel instructed the agent to initialize Git, move the proposal
under `docs/`, commit, and then continue with the previously proposed setup.
That accepts the setup as a block: Standard size, `docs/sdlc/wikipoke/`,
versioned artifacts, no external tracker, and human gates. It does not approve
the specification written afterwards. Conversation language is Spanish;
project documentation is English.

## Gate decisions

| When | Phase | Verdict | By | Note |
| --- | --- | --- | --- | --- |
| 2026-09-08 | design | ACCEPT | Daniel | Explicit response: "ok, apruebo" to the request to approve the specification as the basis for implementation planning. |

This acceptance covers the specification as presented, including its marked
assumptions. It does not answer the open integration concerns or accept a plan
that had not yet been written.

## Open

- Waiting on: integration choices and the human build gate for [plan.md](./plan.md).
- Owner Daniel: settle the installation default for automatic application
  before the implementation plan fixes that behavior (O-001).
- Owner Daniel with agent recommendation: select the first executor and its
  supported lifecycle integrations before planning integration work (O-002).
- O-001 proposed resolution in the plan: enable automatic application only when
  unattended maintenance and its scope are explicitly configured. Pending review.
- O-002 question sent to Daniel: configurable external command, Claude Code
  first, or Codex first. Pending answer; provider-specific integration remains
  conditional and no command flags or lifecycle events are assumed available.
- Next: complete the executor-specific plan after the answer, then obtain human
  build-gate acceptance before creating the build journal and application code.

## Record limitations

The source ledger in the specification reconstructs the preceding conversation.
It is not a contemporaneous implementation journal. The setup commit happened
before the cycle; it is administrative work explicitly requested by Daniel.
A build journal will start when implementation begins, not retroactively.
