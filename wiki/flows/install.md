---
title: Installing into a repository
type: flow
responsibility: What `wikipoke init` and `wikipoke hooks add` actually write, in what order, and what they refuse to touch.
sources:
  - lib/install.mjs
  - bin/wikipoke.mjs
synced: 68c8fa3
trigger: wikipoke init, hooks add|remove, uninstall
related:
  - ../components/install.md
  - ../components/hooks.md
---

```
wikipoke init [--claude] [--dir docs/wiki]
   │
   ├─ --dir given?  → validWiki()  → write/remove .wikipoke.json     (only when not "wiki")
   │
   ├─ wiki/CONVENTIONS.md    exists? kept : written from the template
   ├─ wiki/.wikipokeignore   exists? kept : written from the template
   ├─ .agents/skills/wikipoke-{ingest,query,lint}/SKILL.md     ← always
   ├─ .claude/skills/…                                         ← if .claude/ or CLAUDE.md, or --claude
   │
   ├─ list the hooks, marking the ones the repository shows signs of using
   └─ TTY?  ask which to install        no TTY?  install none, tell the agent to ask
```

`init` writes no page, no `index.md`, no `log.md` and no checkpoint: the first ingest does. It is
safe to re-run — files that already match are skipped, so an upgrade refreshes the skills and
reports only the difference — and it never overwrites the two files the project owns from the
moment they exist.

Hook detection is a hint, not a decision (`lib/install.mjs:153`): a `.cursor/` directory marks the
`cursor` hook as `used here` in the listing, and nothing more. The hooks change what a terminal and
other agents' sessions do, so they are only ever installed by name.

## The `--dir` contract

`--dir docs/wiki` writes `{"wiki":"docs/wiki"}` to `.wikipoke.json`, and from then on every
template is rendered with that path substituted for `{{WIKI}}` — the skills say `docs/wiki`, the
hooks run `docs/wiki/.wikipoke-hook.sh`, and `CONVENTIONS.md` documents `docs/wiki`. Passing the
default back (`--dir wiki`) removes the config file rather than writing a redundant one
(`lib/install.mjs:120`).

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
