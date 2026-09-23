---
title: Who owns which file
type: concept
responsibility: The `managed by wikipoke` marker, and the three ownership rules every write goes through.
sources:
  - src/lib/install.ts
synced: e3139d1
related:
  - ../components/install.md
  - ../flows/install.md
---

Wikipoke writes into repositories it does not own, so every file it touches falls into one of three
buckets, and the rule for each is decided before anything is written.

**Wikipoke's, and refreshed.** The skills, the notifier, the OpenCode plugin, the Cursor rule.
Each carries the line `managed by wikipoke` and is rewritten by `init` (the skills) or `hooks add`
(a hook and the notifier). Find that
marker, rewrite freely; do not find it, leave the file alone and print a `by hand` line saying what
to add (`src/lib/install.ts:109`). There is no `--force`. That line never carries the marker, since
the marker would make the person's whole file wikipoke's to rewrite or delete; a hook added by hand
is recognised by what it runs instead ([the install flow](../flows/install.md)).

**The project's from birth.** `wiki/CONVENTIONS.md` and `wiki/.wikipokeignore` are written once and
then `kept` forever, even by a later `init` (`src/lib/install.ts:191`). They are the schema and the
ignore list: the project is expected to edit them, and
[when they disagree with the code, they win](./schema-lives-in-the-wiki.md). An upgrade that
silently reset a project's conventions would be the worst bug wikipoke could ship. The opposite
silence has a cost too — a schema the new skills no longer match — so since `87d9fd0` `init` says
when `CONVENTIONS.md` differs from the template it ships and names that template
(`src/lib/install.ts:201`), and changes nothing.

**Shared, and edited surgically.** `.claude/settings.json` and `AGENTS.md` belong to the project but
must hold one wikipoke entry. The JSON is parsed, one `SessionStart` entry is appended, and removal
walks back up deleting only what became empty; `AGENTS.md` gets a block delimited by HTML comments,
and removing it restores the surrounding blank lines. Unparseable JSON is never rewritten — the
person is told what to add by hand.

## Owning a file is not the same as being allowed to add one

Ownership decides whether wikipoke may *rewrite* something. A second rule decides whether it may
put something there in the first place, and it turns on one question: does the file do anything on
its own?

A skill does not. It is Markdown that sits there until a person names it, so `init` writes all six
— `.agents/skills/` and `.claude/skills/` both — without asking anyone. Detection was tried and
does not work: Claude Code reads only `.claude/skills` and runs perfectly well against a checkout
with no `.claude/` and no `CLAUDE.md`, so a repository offers nothing to detect it by. This one did
not, which is why its own skills were invisible to Claude Code until `08177b5`.

A hook does fire on its own, and changes what a terminal prints after a commit or what an agent
sees at the start of a session. That is the person's to agree to, so nothing installs one
unprompted — not even the ones wikipoke can see are wanted. What `init` does instead is refuse to
let the decision evaporate: with nobody at the terminal it prints what is missing, why an
uninstalled notifier means nobody is ever told the wiki went stale, and the command, addressed to
the agent, which knows which hook it is and can ask. See [the entry point](../components/cli.md).

The same rule covers updating one. An upgrade rewrites the skills on the next `init`, because a
skill does nothing until someone names it; a hook it only reports. `hookStatus()` compares every
installed hook, and the notifier they share, with what `hooks add` would write now
(`src/lib/install.ts:224`), and `init` and `wikipoke hooks` list the ones that differ as
`installed, outdated` with the command that updates them. Someone asked for the change, so they
know it is coming. Before `87d9fd0` there was nothing to say it at all, and an agent upgrading a
repository copied the templates over by hand with `sed`.

And the wiki itself belongs to nobody but the project: `wikipoke uninstall` removes the skills and
every hook and leaves `wiki/` standing. The pages are the knowledge; wikipoke is the tooling that
happened to help write them.
