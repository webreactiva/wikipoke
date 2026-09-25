---
title: The interactive init
type: decision
responsibility: Why `wikipoke init` asks a person step by step with a bundled @clack/prompts, why agents never see it, and which of its choices are hard to undo.
sources:
  - src/lib/setup.ts
  - src/lib/prompts.ts
  - scripts/build.ts
synced: 542edcd
related:
  - ../flows/install.md
  - ./typescript-two-ways.md
  - ./cli-read-only.md
  - ../components/cli.md
---

**Decision.** Since `f5879b8` (issue #2, PR #10), `wikipoke init` run by a person at a terminal
greets them with a logo and asks one thing at a time. It asks where the wiki lives, shows what it
is about to write and waits for a yes, explains every hook above a checklist, and ends by saying how
to start. Anyone else gets the plain run, unchanged byte for byte. The questions are drawn by
@clack/prompts, the library `npx skills add` uses, bundled into the package so wikipoke keeps no
runtime dependency.

The intent came from comparing wikipoke's installer with `npx skills add`. The old one wrote the
files first, printed a table, and read hook names typed from memory on one line, so a typo failed
after everything was already on disk. Three things were not allowed to break: what an agent reads,
the empty `dependencies` of the package, and [the CLI never writing a page](./cli-read-only.md).

## Two paths, and who each is for

```
wikipoke init
├── stdin and stdout TTYs, no --yes → interactiveInit()   a person answers
└── anything else                   → the plain run       an agent reads, and asks the person itself
```

Agents install wikipoke through the plain run and parse its output: the invitation tells them to
ask the person which hook they want and run `wikipoke hooks add`. That output is therefore treated
as an interface, and was compared byte for byte with the previous release before the change merged.
`--yes` exists for the agent the TTY test misjudges, one whose commands run in a real terminal,
where a question would wait forever.

## Hard to undo

These become part of what users and scripts depend on once released:

- **`--yes` / `-y`.** Removing it breaks every script that passes it.
- **The exit codes.** A cancel or a no before anything is written exits 1
  (`src/lib/setup.ts:77`), so `wikipoke init && …` stops there. A cancel at the hook checklist
  exits 0, because the files are written by then. A write that fails exits 1 with its message.
- **The rule for asking.** Changing the TTY-and-no-`--yes` test changes what agents running in a
  terminal get.

## Reversible, and what was discarded

- **Bundled, not installed.** The discarded options were a regular dependency, which adds five
  packages to every install for one command, and prompts written by hand on `node:readline`. Hand
  code would have to redo what clack already gets right: redrawing after each key, wrapping, the
  width of each character, and giving the terminal back after a Ctrl+C. clack is itself built on
  `node:readline`, so the choice was about who maintains those edge cases, not about capability.
  Only `src/lib/prompts.ts` imports clack, so another library means one file; how the build
  bundles it is in [TypeScript read two ways](./typescript-two-ways.md).
- **A note above a checklist of bare names.** clack prints a hint beside the row under the cursor
  and beside every ticked one, and wraps a row at the terminal width minus its prefix, colour codes
  counted. That leaves about 67 of 80 columns, too few for the full explanation of a hook on its
  row. So the explanation, the file each hook touches, whether it is committed and whether it is
  installed or outdated, goes in a note above the checklist. The rows keep a short hint that is
  dropped rather than wrapped when it does not fit (`src/lib/setup.ts:57`). A note that would not
  fit is printed without its box, because clack breaks the box itself (`src/lib/setup.ts:86`). The
  margins, 14 and 9 columns, are tuned to clack 1.8.1 and need checking again when it is upgraded.
- **Unticking never removes.** Removal stays with `wikipoke hooks remove`, so a re-run cannot undo
  a hook by accident.
- **A new folder does not move the wiki.** `init` warns that the new folder starts empty and the old
  one stays. Moving pages is left to the person, as it already was with `--dir`.

## Found on the way

Three independent reviews ran before the merge: one against the issue, one exploratory test of the
packed tarball in a pseudo-terminal, one of the code and the packaging. They caught the silent move
of the wiki, the hints lost at narrow widths, the exit code 0 on a cancel, and the stack trace on a
failed write, all fixed before merging. One finding was left out on purpose: `chooseWiki()` accepts
`.git`, `node_modules/x` or `~/x`. That predates this change and `--dir` shares it.
