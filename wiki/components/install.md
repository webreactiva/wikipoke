---
title: The installer
type: entity
responsibility: How init, hooks add/remove and uninstall write files without ever taking something the project owns.
sources:
  - src/lib/install.ts
synced: ee3921c
related:
  - ../concepts/file-ownership.md
  - ./hooks.md
---

The only module in wikipoke that writes anything outside the wiki, and it writes nothing it made
up: every file is a template from `templates/` with `{{WIKI}}` replaced by the repository's real
wiki path (`src/lib/install.ts:104`). That substitution is what lets a project keep its wiki in
`docs/wiki` and still get skills, hooks and a schema that say `docs/wiki` — nothing downstream has
to look the path up, so nothing downstream can disagree about it. A path `chooseWiki()` refuses
makes `init()` throw rather than report (`src/lib/install.ts:193`): the CLI refuses it first, so
only a programmatic caller gets here, and a report that says nothing went wrong while no file was
written is worse than none.

It finds `templates/` through a single relative URL, which resolves from the sources and from the
build alike only because `src/lib/` and `dist/lib/` sit at the same depth. That is why `df4db0e`
moved the modules under `src/` instead of renaming them in place; see
[the build decision](../decisions/typescript-two-ways.md).

Two primitives carry the whole
[ownership rule](../concepts/file-ownership.md): `place()` writes a file only when it is missing or
still carries the `managed by wikipoke` marker, and `unplace()` deletes one under the same
condition (`src/lib/install.ts:128`). Anything else is left alone and reported as a line in
`report.manual` — a step for the person to do by hand, printed in yellow. No flag overrides this.

Three kinds of file, three different rules:

```
templates copied whole     skills, the notifier, the opencode plugin, the cursor rule
   └── place() / unplace(), marker-gated

the project's from birth   wiki/CONVENTIONS.md · wiki/.wikipokeignore
   └── written once, then `kept` forever, even by a later `init`   (src/lib/install.ts:210)

shared files, edited       .claude/settings.json · AGENTS.md
   └── only wikipoke's own entry is added or removed; the rest is preserved
```

The shared-file cases are where the care shows. `wireClaude()` parses `.claude/settings.json`,
appends one `SessionStart` entry and writes the JSON back; `unwireClaude()` removes that entry,
then the now-empty `hooks.SessionStart`, then `hooks`, then the file itself, pruning empty
directories on the way up (`src/lib/install.ts:440`). Unparseable JSON is never overwritten — it
returns `"manual"` and the person is told what to add. `AGENTS.md` gets the same treatment through
HTML-comment delimited blocks — two since `35f9c8a`, the `agents` notifier block and the
`decisions` block, each with its own markers — and is deleted only if removing a block leaves
nothing else. `addBlock()` replaces a block where it sits, so text the project wrote after it stays
after it; before, the `agents` block was cut out and appended again at the end
(`src/lib/install.ts:354`).

The `decisions` hook is the one that writes inside the wiki: besides its block it places
`wiki/.inbox/.gitignore` holding `*`, and a bare `*` an agent wrote in a fresh clone counts as
wikipoke's. It runs no notifier, so `NOTIFIES` keeps it from installing `.wikipoke-hook.sh` or
keeping it alive, and removing it keeps the ignore file while anything else is in the inbox; see
[the decision](../decisions/capture-decisions.md).

The git hook's file is the one place a path is looked up rather than templated: it is wherever
`git rev-parse --git-path hooks` says (`src/lib/install.ts:159`), so a `core.hooksPath` set by a
hook manager is followed. Husky 9 is the exception it has to see through. It points git at
`.husky/_`, rewrites every file there on each install, and runs the hook of the same name one
level up, so a notifier written into `.husky/_/post-commit` was gone by the next `npm install`.
When the hooks directory holds husky's `h` wrapper, `post-commit` goes to its parent instead
(`src/lib/install.ts:165`), `.husky/post-commit`, which a project versions: in a husky repository
the git hook travels with the clone like the other four.

The skills go into both homes every time (`src/lib/install.ts:176`), where the hooks go into none.
The difference is not ownership but whether the file acts on its own, and it is the subject of
[what may be written unasked](../concepts/file-ownership.md).

`init` also reports two things it deliberately does not do (`87d9fd0`): hooks an older wikipoke
installed are marked `outdated` rather than rewritten (`src/lib/install.ts:279`), and a
`CONVENTIONS.md` that differs from the current template gets a `by hand` line naming it rather than
a replacement. Since `62cc97d` that line also says when the kept file predates the Open Knowledge
Format shape, with no frontmatter (`src/lib/install.ts:228`): the skills now write the log in that
shape, so its "State and log" section is the part to carry over first. `hooks add decisions` does
the same for a schema with no "Decisions worth recording" section. Both follow [what may be written unasked](../concepts/file-ownership.md).

`init` is idempotent by construction: `place()` returns early when the content already matches, so
re-running it after an upgrade refreshes the skills and reports only what actually changed.
`uninstall` is `removeHooks(every hook)` plus the skills in both homes, and deliberately keeps
`wiki/`: the pages are the project's knowledge, not wikipoke's.

One asymmetry worth knowing: `hooks add claude` also writes the Claude skills, because the session
briefing it installs points at a skill that has to exist; `hooks remove claude` does **not** take
them away, since skills are not a hook. Only `uninstall` removes them (`src/lib/install.ts:330`).
