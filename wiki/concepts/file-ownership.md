---
title: Who owns which file
type: concept
responsibility: The `managed by wikipoke` marker, and the three ownership rules every write goes through.
sources:
  - src/lib/install.ts
synced: df4db0e
related:
  - ../components/install.md
  - ../flows/install.md
---

Wikipoke writes into repositories it does not own, so every file it touches falls into one of three
buckets, and the rule for each is decided before anything is written.

**Wikipoke's, and refreshed.** The skills, the notifier, the OpenCode plugin, the Cursor rule.
Each carries the line `managed by wikipoke` and is rewritten by `init` or `hooks add`. Find that
marker, rewrite freely; do not find it, leave the file alone and print a `by hand` line saying what
to add (`src/lib/install.ts:104`). There is no `--force`.

**The project's from birth.** `wiki/CONVENTIONS.md` and `wiki/.wikipokeignore` are written once and
then `kept` forever, even by a later `init` (`src/lib/install.ts:177`). They are the schema and the
ignore list: the project is expected to edit them, and
[when they disagree with the code, they win](./schema-lives-in-the-wiki.md). An upgrade that
silently reset a project's conventions would be the worst bug wikipoke could ship.

**Shared, and edited surgically.** `.claude/settings.json` and `AGENTS.md` belong to the project but
must hold one wikipoke entry. The JSON is parsed, one `SessionStart` entry is appended, and removal
walks back up deleting only what became empty; `AGENTS.md` gets a block delimited by HTML comments,
and removing it restores the surrounding blank lines. Unparseable JSON is never rewritten — the
person is told what to add by hand.

And the wiki itself belongs to nobody but the project: `wikipoke uninstall` removes the skills and
every hook and leaves `wiki/` standing. The pages are the knowledge; wikipoke is the tooling that
happened to help write them.
