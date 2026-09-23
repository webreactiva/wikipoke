---
name: wikipoke-agents
description: "Audit or write this repository's AGENTS.md, and the nested ones a subdirectory really needs, so they tell an agent what it would get wrong about the code: the exact commands, the constraints nothing enforces visibly, the traps in the history. Shorter, not longer; every statement checked against the repo; nothing about the wiki. Shows every change as a diff and writes only after a yes. Use when: (1) the user invokes /wikipoke-agents, (2) the user says 'improve AGENTS.md', 'audit AGENTS.md', 'write an AGENTS.md', 'create a CLAUDE.md', 'review CLAUDE.md', 'do we need an AGENTS.md in <dir>?', (3) an agent keeps making the same mistake in this repo."
argument-hint: "[audit|write] [<dir>]"
---
<!-- managed by wikipoke: `wikipoke init` rewrites this file. Project rules go in wiki/CONVENTIONS.md. -->

# wikipoke-agents: an AGENTS.md about the code

`AGENTS.md` is read at the start of every session, before any file is opened, so each statement
in it is paid for on every task. A statement earns its place only with what an agent **would
get wrong without it**. What the agent finds on its own with one `ls`, `grep` or a glance at the
manifest does not belong there, however true it is.

```
sources ──► statements ──► three tests ──► verify in the repo ──► proposed diff
(files, config, CI,            wrong without it?                          │ only on a yes
 git history, people)          checkable here?                            ▼
                               not found in one look?                write AGENTS.md
                                                                     (+ nested, only the delta)
```

The result stands on its own. It never mentions wikipoke or the wiki, and it stays useful if
both are removed. The only exception is a block between `<!-- …:start -->` and `<!-- …:end -->`
markers, such as the wikipoke hook's own: it belongs to a tool, so it stays byte for byte as it is.

## Modes

- **`audit`**, the default when an `AGENTS.md` or a `CLAUDE.md` already exists: judge every
  statement in them.
- **`write`**, the default when none exists: draft one from the sources.
- **`<dir>`** limits the pass to one subdirectory, including whether it needs a file of its own.

## 1. Gather the sources

Read these, in this order. They are what the statements can be checked against:

1. **What people already wrote.** `AGENTS.md` at any depth, `CLAUDE.md`, `.cursor/rules/`,
   `.github/copilot-instructions.md`, and the contributing section of the README. A rule that a
   person wrote down is kept in their words unless the repo shows it is false.
2. **What actually runs.** Manifests and their scripts (`package.json`, `composer.json`,
   `pyproject.toml`, `Makefile`, …) and **the CI workflows**, which are the real gate: the
   commands a change must pass are whatever CI runs, not whatever the README says.
3. **What the toolchain enforces, and what it does not.** Compiler, linter and formatter
   configuration. A rule a tool already enforces with a clear error needs at most the command
   that runs it; a rule it lets through silently is a candidate statement.
4. **What went wrong before.** The history is where the traps are:
   ```sh
   git log --no-merges -i -E --grep='^(fix|revert)' --format='%h %s' -200
   ```
   Open the commits whose subject points to a mistake someone could repeat (a wrong import, a
   file edited that is generated, a command run in the wrong order), not ordinary bugs.
5. **Generated and vendored code**: headers like `DO NOT EDIT`, build output that is committed,
   and the command that regenerates it.

If `wiki/` exists, its `decision` pages and invariants can point you to candidates. Treat them
as leads only: check each one in the code, and cite the code, never the page.

## 2. The three tests

**The unit is the statement**: one fact or rule that can be checked on its own. It is not the
line, which is where the text happened to wrap, nor the bullet, which often packs three rules
together. "Imports name the `.ts` file, and only erasable syntax is allowed" is two statements,
and each one can pass or fail on its own.

A statement stays only if it passes all three:

1. **Wrong without it.** Name the mistake an agent would make. If you cannot, cut it.
2. **Checkable here.** A file, a script, a config value, a commit or a person's explicit rule
   backs it up. Otherwise it is an opinion: ask, or drop it.
3. **Not found in one look.** The script list is one look away, so listing it fails. Saying
   *which* of twelve scripts must pass before a commit passes.

**What usually passes:** the exact verify commands, and their order when it matters. Syntax or
APIs that are forbidden even though they would compile. Files that must not be edited by hand,
and what regenerates them. Where a new thing goes when the obvious place is wrong. A trap from
the history, in one sentence. Team rules (language, commit format, what needs a person's approval).

**What usually fails:** a directory tour, the stack as the manifest already lists it, generic
advice ("write tests", "keep functions small"), what a module does, version numbers and dates
that will go stale, and anything about the wiki.

## 3. Which files

**One file for every agent.** Codex, OpenCode, Cursor and most other agents read `AGENTS.md`;
Claude Code reads `CLAUDE.md`, and a `CLAUDE.md` whose only line is `@AGENTS.md` imports the
other file. So the content goes in `AGENTS.md`, whichever name the person asked for:

| the repository has          | the proposal (`CLAUDE.md` = a file whose only line is `@AGENTS.md`)  |
| --------------------------- | -------------------------------------------------------------------- |
| neither file                | a new `AGENTS.md`, and a new `CLAUDE.md`                             |
| only `AGENTS.md`            | changes to `AGENTS.md`, and a new `CLAUDE.md`                        |
| only `CLAUDE.md`            | its content moved to `AGENTS.md`, `CLAUDE.md` reduced to the import  |
| both, `CLAUDE.md` imports   | changes to `AGENTS.md` only                                          |
| both, with their own content | merged into `AGENTS.md`; what only Claude Code needs stays below the import |

If the person asks for a `CLAUDE.md` of its own with no `AGENTS.md`, do that, and say once what
the other agents will miss.

**Nesting: only the delta.** The root file is the default. A subdirectory gets its own
`AGENTS.md` only when something applies there and **not** at the root: its own manifest or
toolchain, a different test command, another language, generated code, or a rule that would be
wrong elsewhere. The nested file holds only that difference. Assume the agent reads the root file
as well, so never repeat it. When in doubt, add one statement about that subdirectory to the root
file instead of creating a new one.

## 4. Verify before proposing

Check every statement you propose, and that includes the ones you keep from the existing file.
Copying a false statement across is the most common way a new file goes wrong.

- Every path the file names exists. Every command it names exists as a script or a binary, and
  runs if it is cheap (a typecheck, a lint). A reference that no longer exists is the first finding.
- Every "never" and "always" is still true: grep for the forbidden thing. If the code already
  breaks the rule, report that instead of repeating the rule.
- Nothing that goes stale on its own: no timings, no counts ("three skills"), and no versions the
  manifest already states.
- Nothing that repeats a tool's managed block outside its markers. Once that block is removed,
  the copy would be left behind.

## 5. Show the diff, then ask

Nothing is written before the person has seen the change as a diff and said yes. There is no
exception for small changes, for new files or for `CLAUDE.md`.

1. **The reasons.** In `audit` mode, split each bullet or paragraph into its statements and give
   one verdict per statement, in the order they appear, quoting each one in a few words so it can
   be found. In `write` mode, list only the `add` verdicts.
   ```
   keep   · "<statement>"                   · <evidence: path, script, commit>
   fix    · "<statement>"                   · <what is wrong> → <proposed text>
   cut    · "<statement>"                   · <which test it fails>
   add    · <proposed statement>            · <evidence, and the mistake it prevents>
   nest   · <dir>/AGENTS.md                 · <the rule that applies only there>
   ```
2. **The diff.** One unified diff for every file the change touches, created files included
   (against `/dev/null`), exactly as it would be written:
   ```diff
   --- a/AGENTS.md
   +++ b/AGENTS.md
   @@ … @@
   ```
   Put it in a `diff` block, with no summary in place of the diff and no "…" in place of lines.
3. **The question, then stop.** Ask whether to apply it, name the files it writes, and end the
   turn there. Silence, a question back or "looks interesting" is not a yes.
4. **On a yes**, write exactly what the diff showed, then show `git diff --stat` (or the list of
   new files) so the person can see that nothing else changed. **On a correction**, show the new
   diff and ask again. Never apply a changed version on the strength of a yes to the earlier one.

A good pass often **cuts more than it adds**. If the file is sound, say so and show no diff:
"nothing to change" is a real outcome.

## Writing the statements

- Keep the file's language and the people's wording for every statement that passes; reword only
  what you are fixing. Never drop a rule a person wrote because it is not about code: it is
  theirs.
- Use imperatives and no preamble. Put one statement per bullet, and two only when they cannot
  be understood apart.
- There is no length target, but every statement costs every session. A root file past about
  80 lines should justify each section.
- Never modify code. Never write secrets, tokens or internal URLs into the file.
