---
slug: wikipoke
size: standard
phase: design
tracker: null
branch: main
opened: 2026-09-08
---

# Wikipoke cycle

## Current position

The Standard cycle begins with design. Intent is folded into the Problem
section of [spec.md](./spec.md); no separate Plan-phase artifact or approval
is claimed. The design gate is open and awaits Daniel's review.

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

No artifact gate has been accepted, rejected, or self-approved.
Record future decisions here with date, phase, verdict, actor, and rationale.

## Open

- Waiting on: human design gate for [spec.md](./spec.md).
- Review first: FR-004, FR-009, and FR-015 carry agent-proposed details.
- Owner Daniel: settle the installation default for automatic application
  before the implementation plan fixes that behavior (O-001).
- Owner Daniel with agent recommendation: select the first executor and its
  supported lifecycle integrations before planning integration work (O-002).
- Next after design acceptance: write the implementation plan, then present
  it at the human build gate before implementing.

## Record limitations

The source ledger in the specification reconstructs the preceding conversation.
It is not a contemporaneous implementation journal. The setup commit happened
before the cycle; it is administrative work explicitly requested by Daniel.
A build journal will start when implementation begins, not retroactively.
