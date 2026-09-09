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
is claimed. Daniel accepted the design on 2026-09-08. Daniel's subsequent "go"
authorizes proceeding with the presented plan and its recommended executor
option. This is acceptance of the plan as a block, not a claim that every
technical detail was individually chosen.

The [proposal](../../PROPUESTA.md) predates this cycle. It records product
discussion and suggested architecture, not an approved implementation plan.
Initial repository commit: `7c82ed9`.

### Where the work stands, 2026-09-09

Implementation is advanced and incomplete. A packaged CLI with fifteen commands
installs into a consumer project, the test suite is green (48 tests at the last
run, still growing), and the whole install → commit → `ingest` → `publish` →
`ask` → `answer` → `capture` → `snapshot` path was exercised by hand against a
disposable repository; the runs are in [evidence.md](./evidence.md).

Three accepted requirements have no implementation at all — FR-008 (intent
versus reality), FR-009 (conflict resolution) and FR-014 (existing-wiki
continuity) — and FR-011 has a write path with no way to read a snapshot back.
The full status is in [plan.md](./plan.md#delivered-and-not-delivered).

The cycle therefore stays in **build**. The accepted plan has not been
delivered, so there is nothing coherent to put in front of the Test gate yet,
and no Test gate has been requested. Evidence is being collected continuously
rather than at the end, which is why `evidence.md` exists while the phase is
still build.

On 2026-09-09 Daniel asked for a review of the work and for whatever was broken
to be fixed. That is a work instruction, not a gate decision: **no gate moved
today**, and the table below is unchanged apart from this note.

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

The rows above are the record as given and are not edited. The executor named
in the 2026-09-08 build row was removed from the product by the superseding
decision at the top of this file; the acceptance of the plan as a block stands,
the executor within it does not.

## Subsequent product decisions

- 2026-09-08, Daniel: automatic activation selected (O-001). Completing executor,
  scope, limits, and execution-environment configuration activates unattended
  maintenance without a separate opt-in. Missing prerequisites remain visible.
  This product setting does not change the human gates of this development cycle
  or select an executor for O-002. Superseded in part on 2026-09-09: there is
  still no separate opt-in — `init` plus `install` is the whole activation — but
  what activates is the deterministic attention signal, not maintenance
  performed by the product.

## Open

- Implement and verify the accepted plan. Test and deploy gates remain human and
  neither has been requested.
- FR-008, FR-009 and FR-014 are unimplemented; FR-011 has no read path. Whether
  the plan is delivered in full or its scope is reduced is Daniel's decision, not
  the agents'. Nothing has been narrowed unilaterally.
- Resolved 2026-09-09: an external agent has now completed the loop on a real
  repository — install, ingest to full coverage with flow pages, a sealed
  checkpoint, a code change with its decisions captured unprompted, and a query
  answered and retained. Recorded in [journal.md](./journal.md).
- O-002 is void as posed: its 2026-09-08 resolution selected an executor that
  the 2026-09-09 decision removed. No replacement question has been put to
  Daniel.
- Two concerns raised during implementation await him: O-004, whether `seal`
  should keep requiring complete coverage before advancing the checkpoint, and
  O-005, how a wiki page is retired when its source disappears. Both are in
  [spec.md](./spec.md#open-concerns).
  - O-004 moved on 2026-09-09, in the opposite direction to relaxing it: `seal`
    now also refuses while no page describes a flow, while any page claims more
    sources than it describes, while the wiki is shaped like the file tree, and
    while the sealed commit is unreachable. The question of whether complete
    coverage should be required at all is still Daniel's.
  - O-005 is narrower than recorded. A page whose source disappears is not stuck:
    republishing it without that source clears the drift and keeps the page as
    the record that the thing existed, which is knowledge a diff cannot carry.
    Every drift entry now names that remedy. What remains open is only whether a
    retired page should stop counting towards coverage and sink in the index.
- Assumption in force: `phase` stays `build` because the accepted plan is not
  delivered. If Daniel would rather close a Test gate over the delivered subset
  and open a new cycle for the rest, that is a different and legitimate reading
  — it needs his decision, not an agent's.

## Record limitations

The source ledger in the specification reconstructs the preceding conversation.
It is not a contemporaneous implementation journal. The setup commit happened
before the cycle; it is administrative work explicitly requested by Daniel.
A build journal will start when implementation begins, not retroactively.

The 2026-09-09 journal entries were appended after that day's work rather than
during it, and say so in their own header. They were written from the delivered
diff, not by the agents that took the decisions. Earlier entries are unchanged.

`evidence.md` was rewritten on 2026-09-09. The evidence it previously held
described the executor-based product and was removed rather than kept as an
appendix; the reason is stated in that file.
