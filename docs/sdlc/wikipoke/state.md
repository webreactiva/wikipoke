---
slug: wikipoke
size: standard
phase: build
tracker: null
branch: main
opened: 2026-09-08
---

# Wikipoke cycle

## Superseding decision

2026-09-09: Daniel rejected provider-specific executor adapters as the primary
workflow. The accepted architecture is agent-first: Git hooks expose durable
attention, agent skills perform research in their native environment, and the
Wikipoke CLI provides deterministic planning, validation, publication, query,
event, and checkpoint commands.

## Current position

The Standard cycle begins with design. Intent is folded into the Problem
section of [spec.md](./spec.md); no separate Plan-phase artifact or approval
is claimed. Daniel accepted the design on 2026-09-08. The cycle is now preparing
implementation. Daniel's subsequent "go" authorizes proceeding with the
presented plan and its recommended executor option. This is acceptance of the
plan as a block, not a claim that every technical detail was individually chosen.

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
| 2026-09-08 | build | ACCEPT | Daniel | "go" after the implementation plan and pending executor recommendation; proceed using the recommended configurable-command executor. |

This acceptance covers the specification as presented, including its marked
assumptions. It does not answer the open integration concerns or accept a plan
that had not yet been written.

## Subsequent product decisions

- 2026-09-08, Daniel: automatic activation selected (O-001). Completing executor,
  scope, limits, and execution-environment configuration activates unattended
  maintenance without a separate opt-in. Missing prerequisites remain visible.
  This product setting does not change the human gates of this development cycle
  or select an executor for O-002.

## Open

- Implement and verify the accepted plan. Test and deploy gates remain human.
- O-002 resolved by proceeding with the recommended configurable command. A
  supplied Claude Code bridge provides a concrete integration, without making
  Claude Code the core execution contract. Real-provider evidence is pending.

## Record limitations

The source ledger in the specification reconstructs the preceding conversation.
It is not a contemporaneous implementation journal. The setup commit happened
before the cycle; it is administrative work explicitly requested by Daniel.
A build journal will start when implementation begins, not retroactively.
