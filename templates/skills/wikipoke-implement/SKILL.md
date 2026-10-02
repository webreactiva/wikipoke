---
name: wikipoke-implement
description: "Implement a plan and note, as you go, the decisions worth keeping in the wiki's inbox, for the next wikipoke-ingest to turn into pages. Use ONLY when the user invokes /wikipoke-implement or names this skill. Never for a request to implement, build, fix or change something that does not name it: that is ordinary work and does not load this skill."
argument-hint: "<plan or task>"
disable-model-invocation: true
---
<!-- managed by wikipoke: `wikipoke init` rewrites this file. Project rules go in {{WIKI}}/CONVENTIONS.md. -->

# wikipoke-implement: build, and keep the reasons

Implement what the person asked for, the way you would without this skill. The only addition:
when you make a decision worth keeping, write it down in the wiki's inbox at that moment, while
you still know what you discarded and why. The code will keep the choice; only the note keeps
the reason.

```
read the bar ──► implement ──► a choice clears the bar? ──► note in {{WIKI}}/.inbox/ ──► keep going
                                      └── no (most choices) ──► nothing
   ▼
close: the work, plus how many notes wait for wikipoke-ingest
```

1. **Read the bar once, before you start**: the section "Decisions worth recording" of
   `{{WIKI}}/CONVENTIONS.md`. It is the project's, and it decides what counts and what a note
   holds. Do not read the rest of the wiki for this; capturing has to stay cheap. If the section
   is missing, record nothing and tell the person to add it from wikipoke's template
   `CONVENTIONS.md`.
2. **Implement.** Follow the plan, the project's agent instructions and its conventions as
   always. This skill changes nothing about how you write code.
3. **Note a decision when you make it**, not at the end, when the discarded alternative is
   already forgotten. One file per decision, `{{WIKI}}/.inbox/YYYY-MM-DD-<slug>.md`, in the format
   the section gives: what you chose, what you discarded and why, whether it is reversible, the
   files it constrains. A few lines. If `{{WIKI}}/.inbox/.gitignore` is missing, create it holding
   `*`: the notes are never committed.
4. **Hold the bar.** Most tasks leave no note. When you hesitate, the choice does not clear it.
5. **Never write a wiki page here.** The inbox is all this skill touches in `{{WIKI}}/`. Pages,
   links, `index.md` and `log.md` are `wikipoke-ingest`'s, with the person there.

**Close** with what you built, then the notes: how many, one line each (the slug and the choice),
and the next step, `/wikipoke-ingest`, before the branch or the worktree goes away, because the
inbox lives only in this working copy.
