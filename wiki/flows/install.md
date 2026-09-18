---
title: Installing into a repository
type: flow
responsibility: What `wikipoke init` and `wikipoke hooks add` actually write, in what order, and what they refuse to touch.
sources:
  - src/lib/install.ts
  - src/bin/wikipoke.ts
synced: b305be6
trigger: wikipoke init, hooks add|remove, uninstall
related:
  - ../components/install.md
  - ../components/hooks.md
---

```
wikipoke init [--dir docs/wiki]
   │
   ├─ --dir given?  → chooseWiki() → unusable? exit 2, nothing written
   │                               → write/remove .wikipoke.json      (only when not "wiki")
   │
   ├─ wiki/CONVENTIONS.md    exists? kept : written from the template
   ├─ wiki/.wikipokeignore   exists? kept : written from the template
   ├─ .agents/skills/wikipoke-{ingest,query,lint}/SKILL.md     ← always
   ├─ .claude/skills/…                                         ← always: Claude Code reads no other
   │
   ├─ list the hooks, marking the ones the repository shows signs of using
   └─ TTY?  ask which to install        no TTY?  install none; if none is installed either,
                                                  invite the agent to ask
```

`init` writes no page, no `index.md`, no `log.md` and no checkpoint: the first ingest does. It is
safe to re-run — files that already match are skipped, so an upgrade refreshes the skills and
reports only the difference — and it never overwrites the two files the project owns from the
moment they exist.

Hook detection is a hint, not a decision (`src/lib/install.ts:204`): a `.cursor/` directory marks
the `cursor` hook as `used here` in the listing, and nothing more. The hooks change what a terminal
and other agents' sessions do, so they are only ever installed by name — but `init` no longer
leaves it at that when there is nobody to ask, and neither does a bare `wikipoke hooks`. Both print
the invitation described in [the entry point](../components/cli.md).

A hint has to be about something the project put there, not something wikipoke did. `claude` used
to be detected by a bare `.claude/` directory, which stopped meaning anything once `init` began
writing `.claude/skills` into every repository: the sign proved only that wikipoke had run. It is
`CLAUDE.md` and the two settings files now (`src/lib/install.ts:75`).

## The `--dir` contract

`--dir docs/wiki` writes `{"wiki":"docs/wiki"}` to `.wikipoke.json`, and from then on every
template is rendered with that path substituted for `{{WIKI}}` — the skills say `docs/wiki`, the
hooks run `docs/wiki/.wikipoke-hook.sh`, and `CONVENTIONS.md` documents `docs/wiki`. Passing the
default back (`--dir wiki`) removes the config file rather than writing a redundant one
(`src/lib/install.ts:172`).

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
