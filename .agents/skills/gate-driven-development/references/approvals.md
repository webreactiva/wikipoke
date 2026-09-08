# Approvals — who opens each gate

Read this when the user wants to change who approves what. Not before: the first cycles run at `human` everywhere, and a developer who has not yet watched the phases come apart cannot judge which ones to hand over.

## The two values

```json
"approvals": {
  "plan":   "human",
  "design": "human",
  "build":  "human",
  "test":   "human",
  "deploy": "human"
}
```

| Value | Who decides | `state.md` line |
|---|---|---|
| `human` | A person reads the artifact and decides | `ACCEPT` / `REJECT` · their name · one line of why |
| `ai` | The agent opens its own gate | `AI` · no name · one line of what it judged |

The object is the canonical form. It is meant to be readable by someone who opens the file cold and has never read this skill.

## What each gate costs when you hand it over

Say this out loud when the user asks to move one. It is the difference between a choice and a shrug.

| Gate | At `human` you are checking | At `ai` you lose |
|---|---|---|
| `plan` | That the problem the agent understood is the problem you have | The chance to catch a wrong problem before anything is designed for it |
| `design` | The concerns — the decisions that are not the agent's to make | The list of things nobody decided on purpose. This is the most expensive one to hand over, and the least obvious |
| `build` | That the approach is one you would have chosen | Approach review. The journal still records what was decided, but after the fact |
| `test` | That the evidence covers what you care about, and the declared gaps are acceptable | Nothing catches an agent that verified the wrong thing convincingly |
| `deploy` | That the package is ready to leave | Release review. The deploy itself is still never performed by the skill |

## Named profiles

Shorthand for the object above. Always expand a profile into the explicit form when writing the config — the user should be able to read what they got.

| Profile | `human` gates | Who it fits |
|---|---|---|
| `strict` | all five | Learning the method. Regulated work. A codebase or an agent you do not know yet |
| `standard` | plan, design, deploy | The agent does not choose the solution alone, but executes it alone |
| `fast` | deploy | You trust the output and want the record, not the stop |
| `trace` | none | Documentation only. The cycle records; it does not govern |

`trace` deserves its name said plainly: at that setting nothing is governed. Every line in `state.md` reads `AI`. That is a legitimate choice for a spike or a throwaway, and a bad one for anything a second person will maintain.

## Escalation

`ai` means "do not stop for the routine", never "do not stop". The agent stops at an `ai` gate anyway when:

- a concern turns up with no owner in the room;
- a failure appears that it cannot explain;
- the artifact contradicts something already accepted at an earlier gate;
- the work turns out to touch payments, auth, migrations, personal data or production config, and the cycle was not sized for it.

An escalation is written in `state.md` as its own line: `ESCALATED`, what triggered it, and what the agent asked. A cycle full of escalations is telling you the profile is set too loose — that is the signal to move a gate back to `human`, and it is worth more than any policy you could write in advance.

## High blast radius

The setting is not overridden. The silence is. When the cycle is High and any gate is `ai`, say it in the first message and write it in `state.md`:

> `build` and `test` run at `ai` on a payments change. Nobody will read the plan or the evidence. Configured in `.claude/gate-driven.json`.

The user is allowed to run fast on a high-risk change. They are not allowed to do it without noticing.

## Two things the setting never reaches

- **Performing a deploy.** `deploy: ai` approves the release package. The merge to production, the deploy command, the release cut — the skill hands those back at every setting, because the action is irreversible and outward-facing.
- **The distinction in the record.** `AI` never becomes `ACCEPT`. No configuration value, no user instruction, no time pressure changes that. A record that cannot tell a read artifact from an unread one has lost the only thing it was for.
