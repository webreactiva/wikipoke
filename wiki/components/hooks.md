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
synced: b305be6
related:
  - ./install.md
---

Five hooks, one notifier. `wiki/.wikipoke-hook.sh` is the only thing that actually runs: it finds
the repository root, exits silently when there is no `.wikipoke-state.json` (an unseeded wiki owes
nothing), and otherwise runs `wikipoke check drift` from `node_modules/.bin` or from the global
install. It never fails: every path ends in `exit 0`, including the one where wikipoke is
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

## Only one of the five cannot travel

The table's first column decides more than which tool is told: it decides whether a clone gets the
hook at all. `git` writes into `.git/hooks/`, which git never versions, so it is per-clone by
construction — every checkout has to run `wikipoke hooks add git` again, and nothing about the
repository can carry it. The other four write ordinary repository files (`.claude/settings.json`,
`.opencode/plugin/wikipoke.js`, `.cursor/rules/wikipoke.mdc`, a block in `AGENTS.md`), so committing
them makes the notice arrive for everyone who clones, with nobody installing anything.

That matters because hooks are never installed by default and `init` only offers them at a TTY
(see [the entry point](./cli.md)): a repository set up through an agent gets none, and drift then
goes unreported until a person happens to run `wikipoke check` by hand. A repository that wants the
notice to survive its own setup should install and commit at least one of the four, `agents` being
the cheapest since it needs no tool-specific file.

Silence is the design. The notifier prints nothing when the wiki is current, so a current wiki adds
nothing to any prompt and costs nobody attention. Until `aafa306` that was only half true: it ran
`check drift coverage`, and coverage is a backlog meant to outlive every pass, so on any repository
seeded honestly the notifier never went quiet. On a real OpenCode run the plugin put the same
32-file list into the system prompt of every new session, followed by "the wikipoke-ingest skill
reconciles it" — a standing nudge to leave the person's task for a wiki chore. The notifier now runs
drift alone (`templates/wikipoke-hook.sh:15`), which also carries the citations a stale page lost;
coverage stays in `wikipoke check` and in the skills, where someone asked for it. When it does speak it says what is owed and
names the skill — and stops there. **No hook ever writes the wiki**: ingesting is a person's call,
made by launching `wikipoke-ingest`, and an automatic wiki would be a wiki nobody reviewed. See
[the decision](../decisions/notify-never-write.md).
