# Phases in detail

Read the section for the phase you are actually in. Each one answers: what it is for, how to run it, what "good" looks like, and what the gate asks.

- [Plan](#plan) · [Design](#design) · [Build](#build) · [Test](#test) · [Deploy](#deploy)
- [Entering mid-cycle](#entering-mid-cycle)

---

## Plan

**Produces** `intent.md` — the problem in the originator's own terms. **Skipped for** None and Small cycles; folded into `spec.md` for Standard.

The value of this phase is that the person who wants the thing describes it before anyone translates it. Every translation loses something, and the losses are invisible later — nobody can tell from a spec which constraint was real and which one an analyst invented.

**How to run it.** Let them talk first, then interrogate. Useful questions, roughly in order of how often they expose something:

- Who is hurt by this today, and what do they do instead?
- What does "better" look like concretely enough to notice when it arrives?
- What is explicitly out of scope? (The answer here prevents more rework than any other.)
- What must stay true — data that cannot leave, auth that cannot change, a deadline?
- What is still an open question, and who owns the answer?

**Good looks like** an intent a stranger could not confuse with a neighbouring feature, with the out-of-scope line filled in and open questions named rather than resolved by guess.

**Anti-pattern:** an intent that names files, endpoints or libraries. That is a spec wearing an intent's clothes, and it forecloses design decisions before anyone weighed them.

**Gate:** the originator (or product owner) accepts that this is what they meant. Record accept/reject, who, and the one thing they corrected.

---

## Design

**Produces** `spec.md` — what will be built and under which constraints, with concerns flagged.

Requirements and design collapse into one pass here. The reason to keep the phase at all is not the document, it is the **flagged concerns**: the points where policy, security, existing architecture or contradictory requirements do not let you proceed cleanly. Those are exactly what a human analyst would have escalated, and the whole gain of doing this in one session is that they surface in an afternoon instead of in a review three weeks later.

**How to run it.** Read `intent.md`, then read what the project already says: `AGENTS.md`, applicable agent-specific instructions such as `CLAUDE.md` and `.claude/rules/`, and any skill that encodes a policy (security, API conventions, design system, accessibility). Write the spec against those constraints, and while writing, keep a running list of everything you could not satisfy.

For each concern, name three things: what the conflict is, who owns the decision, and what you did in the meantime (chose a side and why, or stopped). A concern without an owner is a wish.

**Good looks like** a spec an engineer can plan against with no further conversation, plus a concerns section that is not empty on non-trivial work.

**Gate:** the product owner accepts the spec; each concern is routed to its owner or explicitly deferred with a reason. High blast radius adds a technical lead. Record who resolved which concern.

---

## Build

**Produces** `plan.md`, then `journal.md` and the implementation.

The plan exists because a diff is the most expensive place to discover a design disagreement. While the change is still a paragraph, changing course costs a paragraph.

**How to run it.** Plan mode is the natural fit — the codebase can be read, nothing can be written. Produce: the files that change, the order of the work, what could break, and what will prove it works. Then interrogate the plan before accepting it:

- What is the riskiest step, and what happens if it goes wrong?
- What else calls the code being changed? (Grep, do not assume. A fix applied to one caller leaves its siblings broken.)
- What did you choose not to do, and why?

**Good looks like** a plan an engineer who never saw the conversation could implement. If a step reads "handle the edge cases", it is not a plan yet.

**During implementation:** when reality departs from the plan, update `plan.md` in the same change with a one-line reason. A plan that quietly drifts stops being a record.

### The journal

`journal.md` is the decision log for this phase — a *daybook*, in the older name for it. Append-only, written as the work happens. It exists because Build is the longest unsupervised stretch in the cycle: the plan was accepted before it and the evidence is read after it, and everything decided in between currently leaves no trace.

**What earns an entry:**

- A decision you took without asking. What you chose, what you rejected, one line of why.
- A dead end. What you tried, why you abandoned it. This is the entry that saves the next person the most time and the one most often skipped.
- Something you learned that the plan did not know — a caller the grep missed, an assumption that turned out false.
- A tool or environment problem you worked around, so the workaround is not mistaken later for a design choice.

**What does not:** narration of steps that went as planned. The journal records decisions, not progress.

**Format.** One entry per decision, timestamped, three lines at most. No template ceremony:

```
- 14:02 · Read the config with `config()` inside the service, not a container binding.
  Rejected: binding in the provider. Reason: the existing unit test builds the
  service with `new`, and a bound array argument would rewrite it for no behavior.
```

**Rules that matter more than the format:**

- Write it *now*, not at the end. A journal written in one sitting after the fact is a reconstruction, and its first line must say so. That is still useful — it is only dishonest when it is silent about being retrospective.
- Never edit an entry. If a decision is reversed, append the reversal with its reason. The reversal is the interesting part.
- Timestamps are not decoration here: the interval between entries is what shows where the work actually went.

**What it feeds.** `evidence.md` is written *from* the journal, and the "Departures" section of `plan.md` is a filtered read of it. Entries that turn out to be durable and architectural get promoted to an ADR if the project keeps them — the journal is the raw tape, an ADR is the edited record.

**Gate:** an engineer accepts the plan **before** code is written. Routine work: the engineer running the session. High blast radius: a second person. Record who accepted and any condition they attached. The journal itself has no gate — it is read at the Test gate, which is what keeps the middle of Build auditable without stopping it.

---

## Test

**Produces** `evidence.md` — proof the change works, gathered by the agent before a human looks.

The point is not test coverage as a number. It is that the person reviewing should not be the one discovering the change is broken; their attention is worth more spent on intent and risk. Every claim here is a pasted output, not a sentence about an output.

**How to run it.**

- Read `journal.md` first and write this document from it. Written from memory or scrollback instead, `evidence.md` becomes a summary of what you happen to remember mattering — which is reliably the parts that went well.
- Run the project's real commands (its `CLAUDE.md` usually names them) and paste the result, including the failure if it failed.
- For a bug fix, write the failing test first, confirm it fails for the reason you expect, and do not edit it afterwards. A test that existed before the fix and was not rewritten is the proof the bug is gone.
- For UI, capture the visual check: screenshot against the mock, the two neighbouring flows, the error state.
- Note what you did **not** verify. An honest gap is information; a silent one is a trap.

**Good looks like** a reviewer being able to skip re-running anything mechanical.

**Anti-pattern:** editing a test so it passes. If a test fails, the code is the suspect. If the test really was wrong, that is a finding to record, not a quiet fix.

**Gate:** evidence is attached and the gaps are named. Who opens it comes from `approvals.test` in the config, not from the cycle size. At `ai`, the agent judges its own evidence — which is the one gate where that is most tempting and least safe, because an agent that verified the wrong thing will find its own proof convincing. The declared-gaps section is what makes `test: ai` survivable: it is the part a reader can check without re-running anything.

---

## Deploy

**Produces** the merge request, the review findings, and a gate line. **Never a deployment.**

Two things happen here. First, review: read the diff against `spec.md` and `plan.md` and report what does not match, ranked — behavior breaks and data or security exposure first, style last. Use the project's review skill if it has one. Second, the gate: state plainly what still needs a human and stop.

**Separate the two halves before configuring anything here.** *Approving* the release — judging the package ready — is a gate, and `deploy: ai` is a legitimate setting for it. *Performing* the release — merging to production, running the deploy command, cutting the tag — is an action, and this skill never does it at any setting. Hand back the exact command instead. The reason is not caution for its own sake: the action is irreversible and reaches outside the repository, and an agent that runs it has removed the last place anyone could have stopped it.

**The gate asks:**

- Does the diff do what `spec.md` said, and only that?
- Is the evidence attached and honest about gaps?
- Who authorizes, and are they named?
- What is the rollback, and has anyone actually run it?

At `deploy: ai` the agent answers these itself and records `AI`. The fourth question is the one that most often turns an `ai` deploy gate into an escalation — an untested rollback is not a rollback.

Record the verdict, the merge request link, and who approved. If it was rejected, record why — rejections are the most useful lines in the log.

---

## Entering mid-cycle

Work rarely arrives at the start of the chain. Someone shows up with code already written, or an issue already specced, or a review already open.

Do not rewind. Establish what exists, write the record from that point forward, and mark the earlier phases as skipped with a reason rather than reconstructing artifacts nobody used:

```
| 2026-09-07 | plan,design | skipped | Daniel | work arrived as a specced issue (#1014) |
```

The one thing worth backfilling is the **gate that was never given** — if code is written and nobody accepted a plan, the useful move is not to write a retroactive `plan.md` but to hold the deploy gate properly.
