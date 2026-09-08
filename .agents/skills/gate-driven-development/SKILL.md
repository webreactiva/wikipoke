---
name: gate-driven-development
description: >-
  Drive work through plan, design, build, test, and deploy gates with written
  artifacts, recorded human or AI decisions, and state that survives sessions.
  Use for gate-driven development, governance, approval gates, implementation
  decision journals, or resuming an existing cycle. Supports optional GitHub
  or GitLab status sync. Scale the ceremony to the change; ordinary one-line
  fixes do not need a cycle.
---

# Gate-driven development

When an agent writes most of the diff, the scarce thing stops being code and becomes **the record of who decided what**. Review, approval and sign-off were sized for human output; they are now the bottleneck, and the failure mode is not a bad line of code — it is a decision nobody made on purpose, discovered three months later with no trace of how it got there.

This skill keeps that record by putting a gate between every phase. Five phases, five gates: each phase produces one artifact, a human accepts it, and only then does the work move on. What drives the cycle is the gates rather than the phases — a phase can be as small as a paragraph, but an open gate stops everything, which is the only way an unrecorded decision cannot slip through. The chain of files answers "what was asked, what was decided, who approved it" without anyone reconstructing it from memory.

The record is the product. Ceremony that produces no record is waste, and this skill cuts it.

## What it maintains

One directory per unit of work — a **cycle** — holding the artifacts and the decision log:

```
<home>/<slug>/
├── state.md      the phase, the tracker link, and every gate decision
├── intent.md     what is wanted and why            (Plan)
├── spec.md       what will be built, constrained    (Design)
├── plan.md       how, which files, which tests      (Build)
├── journal.md    decisions taken while building      (Build, append-only)
└── evidence.md   what proves it works               (Test)
```

Deploy adds no file of its own: its record is the merge request and the gate line in `state.md`.

`journal.md` is the only file written *during* a phase rather than at the end of one. Everything else is a snapshot; the journal is the tape. Without it, the record shows what was decided at the gates and nothing about the dozens of small decisions between them — which is where an agent actually spends its autonomy.

## First run in a project

Look before asking. Check for `.agents/gate-driven.json`; if it exists, read it and move on. This is project configuration shared by agents, not configuration owned by Claude. If only the legacy `.claude/gate-driven.json` exists, move it to `.agents/gate-driven.json` without changing its values or asking the setup questions again. If both exist and differ, report the conflict rather than silently choosing or merging approval settings. If neither exists, look for an existing convention — a `docs/plans/`, `docs/specs/` or `docs/sdlc/` directory, and any rule in `AGENTS.md` or agent-specific instructions such as `CLAUDE.md` about committing planning documents. Then ask **once**, proposing what you found:

1. **Where do cycles live?** (default proposal: `docs/sdlc/`)
2. **Are artifacts committed?** Committed artifacts make git the audit trail and are the stronger governance position. Uncommitted keeps the repo clean and pushes the trail onto the tracker and the code commits. Respect an existing project rule over your own preference — and if the project says "don't commit planning docs" while the work is high blast radius, say plainly that the trail then depends on the tracker.
3. **Sync with a tracker?** Detect the remote first (`git remote -v`): `gitlab.com` → `glab`, `github.com` → `gh`. Confirm the CLI is installed and authenticated before offering it. If the user declines, the cycle runs local-only and nothing later should nag about it.

Do **not** ask about approvals on the first run. Every gate starts `human`, which is the setting that teaches the method. Offer to change it later, once they have seen the phases — see [Who opens each gate](#who-opens-each-gate).

Save the answers in `.agents/gate-driven.json` so no future session asks again:

```json
{
  "home": "docs/sdlc",
  "commit_artifacts": false,
  "tracker": "gitlab",
  "approvals": {
    "plan":   "human",
    "design": "human",
    "build":  "human",
    "test":   "human",
    "deploy": "human"
  }
}
```

Add the home directory to `.gitignore` when `commit_artifacts` is false — half-committed artifacts are worse than none, because the trail looks complete and is not.

## Who opens each gate

Every gate has exactly one setting, and it answers one question: **who opens this door?**

| Value | Who decides | How it lands in `state.md` |
|---|---|---|
| `human` | A person reads the artifact and decides | `ACCEPT` or `REJECT`, with their name and one line of why |
| `ai` | The agent opens its own gate | `AI`, with no name against it — because nobody read it |

There is no third value. `ai` is self-approval, and the record must never let it look like anything else.

**Everything starts at `human`, and that is the point.** This skill teaches the SDLC as much as it enforces it: a developer who has never watched intent, spec, plan and evidence come apart into separate documents cannot judge which ones they can safely hand to an agent. So the first cycles stop everywhere. As they get comfortable with a phase, they move it to `ai` and see what changes in the record. The dichotomy `human` / `ai` is the lesson — which of these two things is doing the deciding, and what is lost when it moves.

Move gates one at a time, in the direction they earned. Say so plainly when you propose it: *"You have accepted the plan unchanged in the last three cycles. Want `build: ai`? Your name stops appearing on that line."*

`references/approvals.md` has the named profiles (`strict`, `standard`, `fast`), what each one implies, and the escalation rule. Read it when the user asks to change a setting, not before.

### Two things this setting does not do

- **`ai` does not mean "do not stop".** It means "do not stop for the routine". If the agent hits something outside the plan — a concern with no owner, a failure it does not understand, a decision the artifact did not anticipate — it stops and asks anyway. That is an **escalation**, and it is written in `state.md` as one.
- **`deploy: ai` approves the release; it does not perform it.** Approving means the agent judges the package ready: diff reviewed against spec and plan, merge request opened, test plan written. Performing means merging to production, running the deploy command, cutting the release. **This skill never performs a deploy at any setting** — not because the gate demands it, but because the action is irreversible and outward-facing. Hand back the command instead.

High blast radius — payments, auth, migrations, personal data, production config — does not override the setting, but it does force you to say so. When a cycle is High and any gate is `ai`, name it in the first message and write it in `state.md`: which gates nobody will read, and who configured it that way. The user is allowed to run fast on a payments change. They are not allowed to do it by accident.

## Size the ceremony to the change

Running the full chain on a copy change is how governance earns its bad name — people route around a process that costs more than the work. Decide the size first, say which one you picked and why, and let the user overrule you.

| Size | What it looks like | What the cycle requires |
|------|--------------------|-------------------------|
| **None** | One-liner, copy, config toggle, no behavior change | No cycle. Say "this doesn't need a cycle" and just do the work. |
| **Small** | One file, behavior covered by existing tests | `plan.md` + `journal.md` + the deploy gate. Intent and spec fold into the plan's first paragraph. |
| **Standard** | A feature, several files, a new endpoint or screen | `spec.md` (intent folded into its Problem section), `plan.md`, `journal.md`, `evidence.md`, deploy gate. |
| **High** | Payments, auth, migrations, personal data, production config, breaking API, anything a regulator would ask about | Full chain, `intent.md` separate, concerns routed to a named owner, a named human on every gate. |

`journal.md` is in every size that writes code, including Small. It is the cheapest artifact in the chain — one line per decision, written as you go — and dropping it is what leaves the implementation phase with no record at all.

When in doubt between two sizes, take the smaller one and note in `state.md` that you did. An undersized cycle that runs beats an oversized one that gets abandoned halfway. **The exception:** if you can already name a decision that is not yours to make, do not go smaller — that is the signal you need the Design phase, not a note in the state file saying you skipped it.

## The five phases

Each phase has the same shape: **read the previous artifact → produce this one → put it in front of a human → record their decision**. Full templates and per-phase depth live in `references/phases.md` and `references/templates.md` — read them when you actually reach the phase, not upfront.

**1. Plan — `intent.md`.** Capture what the person wants in their own words: the problem, who it hurts, what better looks like, what is out of scope. Interrogate until it is concrete; an intent that could describe four different features is not done. No solution here — the moment it names files or endpoints, it has become a spec.

**2. Design — `spec.md`.** Turn intent into what will be built, constrained by whatever policy the project encodes (its `CLAUDE.md`, its rules, its other skills). Flag what you cannot satisfy rather than quietly choosing: contradicting policies, missing decisions, anything needing an owner who is not in the room. **Flagged concerns are the whole point of this phase** — a spec with no concerns on non-trivial work usually means they were not looked for.

**3. Build — `plan.md`, then `journal.md` and the code.** Write the plan before touching a file: which files change, in what order, what could break, and what will prove it works. Plan mode is the natural fit. The bar is that an engineer who never saw the conversation could implement from the plan alone. When the implementation departs from the plan — it will — update `plan.md` in the same change, because a plan that silently drifts stops being a record and becomes a lie.

Then open `journal.md` and append to it **while you work**, not afterwards. One entry per decision you took without asking: what you chose, what you rejected, one line of why. Also the dead ends, and anything you learned that the plan did not know. This is the phase where an agent decides the most and is watched the least; the journal is what makes that stretch auditable without adding a gate to the middle of it. Build has no gate of its own — the plan is accepted before it and the journal is read at the Test gate after it.

**4. Test — `evidence.md`.** Verification the agent ran itself, pasted as output rather than claimed in prose: the test command and its result, the build, the screenshot, the manual check. For a bug fix, the failing test comes first and is not edited afterwards. "Tests pass" with no output is not evidence. Write it **from `journal.md`**, not from memory or scrollback — the journal is what stops this document from becoming a tidy summary of what you remember mattering.

**5. Deploy — the gate.** Review the diff against `spec.md` and `plan.md`, open the merge request, list what still needs a human. At `deploy: human` a person approves the package before it goes out; at `deploy: ai` the agent judges it ready and writes `AI` in the record. Either way, **this skill never performs the deploy** — it prepares the release and hands back the command. That is a limit on the action, not on the gate: the approval is configurable, the irreversible step is not.

There is no Maintain phase here on purpose. When something breaks in production later, that is a new cycle starting at Plan with the incident as its intent.

## Gates

A gate is where accountability is placed on purpose. Three rules make it real:

- **Self-approval happens only where it was configured in advance, and never looks like human approval.** A gate the agent opened is written `AI`, with no name against it. The control that cannot be automated away is not the approval — it is the *distinction* between an artifact a person read and one nobody did. Blur that line and the record becomes fiction, which is worse than no record.
- **Every decision is a line in `state.md`** — date, phase, verdict, who, and one line of why. The "why" is what a reader in six months actually needs. An `AI` line still carries a why: what the agent judged and against what.
- **Work does not drift past an open gate.** A `human` gate stops the work, full stop. For Small and Standard cycles you may proceed on a stated assumption when the user is not around, provided the assumption goes in `state.md` and gets surfaced when they return. For High blast radius, the cycle waits.

Ask for a gate decision in one short message: what you produced, the one or two things you want them to look at, and what happens next. Not a wall of text they have to audit.

On a `human` gate, add one sentence saying what this phase is *for* — not what you did in it. Someone learning the method is reading the same message as someone who has run fifty cycles, and the second one can skip a sentence far more cheaply than the first one can reconstruct it.

## Resuming

Sessions end. The cycle does not. On any prompt that references existing work, read `state.md` **before doing anything else**, then say where things stand in a sentence — phase, open gate, what is next — and continue from there. Never restart a cycle that already has a record; re-deriving an intent that was accepted two weeks ago wastes everyone's time and silently replaces decisions that were already made.

If the code has moved but the record has not, do not pretend otherwise. Write what actually happened ("implemented before the plan was written; plan reconstructed from the diff") and carry on. A record that admits its gaps is worth more than a tidy fiction.

## Tracker sync

Optional, off unless configured. When on: **the artifacts are the truth for content, the tracker is the truth for status.** Link both ways once — the issue gets a comment naming the cycle path, the cycle's `state.md` names the issue — and after that only status moves.

If the project already has a workflow skill for its tracker (a `gitlab-workflow`, a `pr` skill, a custom command), use it instead of raw CLI calls; it encodes conventions this skill does not know. Otherwise `references/trackers.md` has the `glab` and `gh` recipes and the phase-to-status mapping.

## What breaks this

- **Artifacts nobody reads.** If a spec never changed anything, the cycle was too big for the work. Drop a size next time.
- **Self-approval that hides.** Handing a gate to the agent is a legitimate choice. Writing `ACCEPT` where nobody read anything is not. The separation that cannot be automated away is not the approval itself — it is the record's ability to tell the two apart.
- **Starting a new user at `fast`.** The settings are also the lesson. Someone who has never seen a spec and a plan as separate documents cannot judge which of them they can safely stop reading.
- **Retro-fitted records.** A `plan.md` written after the diff to make the trail look complete is worse than no plan, because it is evidence of a decision that never happened. The same rule binds `journal.md` hardest: a journal written in one sitting at the end is a reconstruction, and it must say so in its first line. A reconstruction is still worth having — it is only worthless when it pretends to be contemporaneous.
- **The agent sizing its own cycle.** The size decides how many gates the agent will face, so leaving it to the agent hands the subject the calibration of its own control. Propose a size with a reason; let the human confirm it in the same message as the configuration question.
- **Nagging.** Ask each configuration question once, record the answer, and stop bringing it up.

## References

- `references/approvals.md` — `human` vs `ai` per gate: what each one costs to hand over, the named profiles, escalation
- `references/phases.md` — what each phase produces, the questions to ask in it, and its gate criteria
- `references/templates.md` — `state.md`, `intent.md`, `spec.md`, `plan.md`, `journal.md`, `evidence.md` and the deploy gate checklist
- `references/trackers.md` — `glab` / `gh` recipes, status mapping, and how to keep the two-way link
