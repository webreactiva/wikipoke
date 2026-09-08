# Templates

Copy the shape, not the word count. Every one of these should be shorter than it looks — a section with nothing to say gets deleted, not padded. If a template fights the change in front of you, the change wins.

- [state.md](#statemd) · [intent.md](#intentmd) · [spec.md](#specmd) · [plan.md](#planmd) · [evidence.md](#evidencemd) · [Deploy gate checklist](#deploy-gate-checklist)

---

## state.md

The only file that always exists. It is the audit trail; everything else is supporting material.

```markdown
---
slug: utm-inheritance
size: standard
phase: build
tracker: gitlab#1014
branch: feature/1014
opened: 2026-09-07
---

# UTM inheritance on recurring instalments

## Decisions

| When | Phase | Verdict | By | Note |
|------|-------|---------|-----|------|
| 2026-09-07 | design | ACCEPT | Daniel | dropped the per-form override, one global rule |
| 2026-09-08 | build | AI | — | plan followed; departures logged in journal.md |
| 2026-09-09 | test | ESCALATED | Daniel | `ai` gate, but the export job failed for a reason I could not explain |
| 2026-09-09 | test | ACCEPT | Daniel | pest green, no browser check on the admin view |

## Open

- Waiting on: deploy gate — needs release authorization
- Assumption in force: instalments inherit the parent's UTM, not the request's (unconfirmed with marketing)
```

`Open` is what a returning session reads first. Keep it to what is genuinely unresolved; a stale open item is a lie about where things stand.

**Verdicts.** `ACCEPT` / `REJECT` carry a person's name — someone read the artifact. `AI` carries none, because nobody did; the `By` column stays `—` and the note says what the agent judged. `ESCALATED` is an `ai` gate the agent stopped at anyway, and it names the trigger. Never write `ACCEPT` for a gate no human opened, whatever the configuration says.

---

## intent.md

```markdown
# Intent: <what the person wants, in their words>

Author: <who> · Status: draft | accepted

## Problem
What cannot be done today, and who it hurts. Two or three sentences.

## Proposed outcome
What better looks like, concretely enough to notice when it arrives.

## Affected users and systems
Who touches it, and which services or teams it crosses.

## Constraints
What must stay true. Data that cannot move, auth that cannot change, a date.

## Out of scope
The line that prevents the most rework. Fill it in.

## Open questions
What is unresolved, and who owns each answer.
```

---

## spec.md

```markdown
# Spec: <slug>

From: intent.md (<date>) · Status: draft | accepted

## Problem
One paragraph. For Standard cycles this replaces intent.md — state the problem
and the out-of-scope line here.

## Behavior
What the system does after this change, from the outside. Include the states
that are easy to forget: empty, error, unauthorized, partial, concurrent.

## Design
The shape of the solution: components, data, contracts. Not file-by-file — that
is the plan's job.

## Policy applied
Which project rules constrained this and how (security, API conventions, design
system, accessibility, data handling).

## Concerns
The reason this phase exists. For each: the conflict, who owns the decision,
and what was done in the meantime.

| Concern | Owner | Interim decision |
|---------|-------|------------------|
| PII in the export contradicts the retention rule | data protection | excluded the field; confirm before launch |

## Out of scope
```

---

## plan.md

```markdown
# Plan: <slug>

From: spec.md (<date>) · Status: draft | accepted

## Files that change
path/one.php — what changes and why
path/two.tsx — new

## Order of work
1. …
2. …

## What could break
The riskiest step and its blast radius. Every caller of the code being changed
— grepped, not assumed.

## Proof
The tests that will exist and what each one would catch. The manual or visual
check, if any.

## Not doing
Options considered and dropped, with one line each. This is what stops the same
discussion happening again in review.

## Departures
Filled in during implementation. What changed against this plan and why.
A filtered read of journal.md — the entries that contradict this plan.
```

---

## journal.md

Append-only. Written during Build, never after it. If it *was* written after,
the header says so — a reconstruction is useful, a reconstruction passing as
contemporaneous is not.

```markdown
# Journal: <slug>

Started <date> · append-only · entries are never edited, only superseded

- 13:24 · Chose X over Y.
  Rejected: Y. Reason: <one line>.

- 13:51 · Dead end: tried Z, abandoned it.
  Reason: <what made it not work>. Cost: ~20 min.

- 14:02 · Learned: <caller / assumption / constraint the plan did not know>.
  Effect on the plan: <none | updated section N>.

- 14:18 · Reversed the 13:24 entry. Now doing Y after all.
  Reason: <what changed>.
```

Entries that turn out durable and architectural are promoted to an ADR if the
project keeps them. The journal is the raw tape; an ADR is the edited record.

---

## evidence.md

```markdown
# Evidence: <slug>

## Commands run

$ <the project's real test command>
<pasted output, including failures>

## Manual checks
What was exercised by hand, in which environment, and what was seen.

## Visual
Screenshot paths or a description of the comparison against the mock.

## Not verified
The honest gaps: what was not exercised, and why. Being explicit here is what
makes the rest of the file trustworthy.
```

---

## Deploy gate checklist

Not a file — a message. Short enough that a person reads all of it.

```markdown
**Deploy gate: <slug>**

- Diff matches spec: yes / deviations listed below
- Evidence: <pest 43 passed, build ok, admin view unchecked>
- Review findings outstanding: <none | 2 important, listed in the MR>
- Rollback: <the command, and when it was last exercised>
- Needs: <named person> to authorize the release

I have not deployed and will not. Say the word and I'll hand you the command.
```
