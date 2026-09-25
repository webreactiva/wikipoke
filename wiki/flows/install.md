---
title: Installing into a repository
type: flow
responsibility: What `wikipoke init` and `wikipoke hooks add` actually write, in what order, and what they refuse to touch.
sources:
  - src/lib/install.ts
  - src/bin/wikipoke.ts
  - src/lib/setup.ts
synced: 542edcd
trigger: wikipoke init, hooks add|remove, uninstall
related:
  - ../components/install.md
  - ../components/hooks.md
  - ../decisions/interactive-init.md
---

```
wikipoke init [--dir docs/wiki] [--yes]
   │
   ├─ --dir given?  → chooseWiki() → unusable? exit 2, nothing written
   │
   ├─ stdin and stdout TTYs, no --yes? ──► interactiveInit()  (src/lib/setup.ts)
   │     where should the wiki live? → "This will write" → yes? → init() → hooks note
   │     → checklist → addHooks(new or outdated ticks) → "How to start"
   │
   └─ otherwise: the plain run, what agents read
         │
         ├─ write/remove .wikipoke.json                          (only when not "wiki")
         ├─ wiki/CONVENTIONS.md    exists? kept (and said if it differs from the template) : written
         ├─ wiki/.wikipokeignore   exists? kept : written from the template
         ├─ .agents/skills/wikipoke-{ingest,query,lint,agents}/SKILL.md  ← always
         ├─ .claude/skills/…                                             ← always: Claude Code reads no other
         │
         ├─ list the hooks: installed, installed but outdated, or used here   (outdated: not touched)
         └─ install none; if none is installed either, invite the agent to ask
```

Both paths write through the same `init()` and `addHooks()` in `src/lib/install.ts`; they differ
only in who decides. The split is `src/bin/wikipoke.ts:191`. Before `f5879b8` there was one path
that asked, in a terminal, for hook names typed on one line, after the files were already written.
Now a person at a terminal is asked before anything is written, and everyone else, agents and pipes
included, gets output byte-identical to what it was. `--yes` sends a terminal to the plain run too,
for agents that run their commands in a real terminal, where a question would wait forever. The
reasons and what was traded are in [the decision](../decisions/interactive-init.md).

## The interactive path

`interactiveInit()` (`src/lib/setup.ts:110`) asks where the wiki should live, with the current
folder as the default and `chooseWiki()` as the validator, unless `--dir` already answered. It then
shows what it is about to write and waits for a yes (`src/lib/setup.ts:152`). A cancel or a no before
that point exits 1 with nothing written (`src/lib/setup.ts:77`), so `wikipoke init && …` stops. A
cancel at the hook checklist exits 0 with the files written and no hook, and says so
(`src/lib/setup.ts:175`). A write that fails, such as a file standing where a directory goes, ends
the frame with `Stopped: <message>` and exit 1 instead of a stack trace (`src/lib/setup.ts:101`).

Choosing a different folder for an existing wiki does not move it. The new folder starts empty, the
old one stays, and a warning says so before the yes (`src/lib/setup.ts:137`). Going back to `wiki/`
lists `.wikipoke.json` as removed (`src/lib/setup.ts:141`).

The checklist starts with the installed hooks and the detected ones ticked
(`src/lib/setup.ts:71`). Unticking an installed hook never removes it: `wanted` returns only new or
outdated ticks, and removal stays with `wikipoke hooks remove` (`src/lib/setup.ts:57`). Each hook
has three wordings that must change together: `HOOKS.when` in `install.ts` for the plain run and
`wikipoke hooks`, `SHORT` for the checklist and `TOUCHES` for the note above it
(`src/lib/setup.ts:30`, `src/lib/setup.ts:39`). The `Record<HookName, …>` type makes a missing one a
type error.

`init` writes no page, no `index.md`, no `log.md` and no checkpoint: the first ingest does. It is
safe to re-run — files that already match are skipped, so an upgrade refreshes the skills and
reports only the difference — and it never overwrites the two files the project owns from the
moment they exist.

Hook detection is a hint, not a decision (`src/lib/install.ts:246`): a `.cursor/` directory marks
the `cursor` hook as `used here` in the listing, or pre-ticks it in the checklist, and nothing more. The hooks change what a terminal
and other agents' sessions do, so they are only ever installed by name — but `init` no longer
leaves it at that when there is nobody to ask, and neither does a bare `wikipoke hooks`. Both print
the invitation described in [the entry point](../components/cli.md).

A hint has to be about something the project put there, not something wikipoke did. `claude` used
to be detected by a bare `.claude/` directory, which stopped meaning anything once `init` began
writing `.claude/skills` into every repository: the sign proved only that wikipoke had run. It is
`CLAUDE.md` and the two settings files now (`src/lib/install.ts:79`).

## The `--dir` contract

`--dir docs/wiki` writes `{"wiki":"docs/wiki"}` to `.wikipoke.json`, and from then on every
template is rendered with that path substituted for `{{WIKI}}` — the skills say `docs/wiki`, the
hooks run `docs/wiki/.wikipoke-hook.sh`, and `CONVENTIONS.md` documents `docs/wiki`. Passing the
default back (`--dir wiki`) removes the config file rather than writing a redundant one
(`src/lib/install.ts:180`).

Moving an existing wiki is therefore three steps and no magic: move the folder, edit
`.wikipoke.json`, run `init` again to re-render the skills. Nothing scans for a wiki, so nothing
can find the wrong one.

## What it refuses

Every path here goes through `place()` / `unplace()`, which respect the
[`managed by wikipoke` marker](../concepts/file-ownership.md). A pre-existing `post-commit` hook,
a `SKILL.md` someone edited by hand, an unparseable `.claude/settings.json` — each is left exactly
as it is, and the command prints a `by hand` line telling the person what to add. That is the
whole conflict-resolution strategy, and it is the same for `init`, `hooks add`, `hooks remove` and
`uninstall`.

Following a `by hand` line has to be enough. For the git hook it once was not: `hooks` counted a
`post-commit` as installed only when it carried the marker, and the line the person was told to add
(`src/lib/install.ts:268`) has none, so a hook installed exactly as instructed was listed as missing
forever. Since `25997d8` the git hook counts as installed when `post-commit` runs the notifier
(`src/lib/install.ts:238`), and a project-owned file is never reported as outdated, since the only
thing in it that can fall behind is the notifier it runs (`src/lib/install.ts:232`). The marker
still decides what wikipoke may rewrite; adding it to the person's line would hand their whole
file over.
