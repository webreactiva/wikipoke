---
title: The hooks and the notifier
type: entity
responsibility: The five optional hooks, the one notifier they all run, and why none of them can write the wiki.
sources:
  - templates/wikipoke-hook.sh
  - templates/post-commit
  - templates/opencode-plugin.js
  - templates/cursor-rule.mdc
  - templates/agents-block.md
synced: 68c8fa3
related:
  - ./install.md
---

Five hooks, one notifier. `wiki/.wikipoke-hook.sh` is the only thing that actually runs: it finds
the repository root, exits silently when there is no `.wikipoke-state.json` (an unseeded wiki owes
nothing), and otherwise runs `wikipoke check drift coverage` from `node_modules/.bin` or from the
global install. It never fails: every path ends in `exit 0`, including the one where wikipoke is
not installed at all. A hook that can break a commit or a session start would be uninstalled within
the day.

What differs between the five is only *when* someone is told:

| hook | mechanism | audience |
| --- | --- | --- |
| `git` | `.git/hooks/post-commit` runs the notifier | the person, in their terminal, per clone |
| `claude` | a `SessionStart` entry in `.claude/settings.json` | the agent, at session start |
| `opencode` | a plugin on `experimental.chat.system.transform` | the agent, once per session |
| `cursor` | an `alwaysApply` rule telling the agent to run it | the agent, every session |
| `agents` | a block in `AGENTS.md` saying the same | Codex and anything else that reads it |

The two agent-side mechanisms are worth telling apart. The OpenCode plugin executes the notifier
itself and pushes the output into the system prompt, memoised per session so a long session runs it
once (`templates/opencode-plugin.js:8`); the Cursor rule and the `AGENTS.md` block only *ask* the
agent to run it, because neither tool offers a place to run a command. The Claude hook sits in
between: Claude Code runs the command, and what it prints reaches the session.

Silence is the design. The notifier prints nothing when the wiki is current, so a current wiki adds
nothing to any prompt and costs nobody attention. When it does speak it says what is owed and
names the skill — and stops there. **No hook ever writes the wiki**: ingesting is a person's call,
made by launching `wikipoke-ingest`, and an automatic wiki would be a wiki nobody reviewed. See
[the decision](../decisions/notify-never-write.md).
