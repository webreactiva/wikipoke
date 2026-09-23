---
title: Coverage is debt, not failure
type: concept
responsibility: Why uncovered code never fails a check, and what that buys.
sources:
  - src/lib/coverage.ts
  - templates/wikipokeignore
  - src/bin/wikipoke.ts
synced: e3139d1
related:
  - ./over-broad-sources.md
  - ../flows/ingest-pass.md
---

`wikipoke check coverage` lists tracked files no page's `sources:` claims, and a plain run exits 0
no matter how long that list is (`src/bin/wikipoke.ts:328`). Only lint errors — a malformed page, a
dead source, a broken link — fail. The list is a backlog, and a long backlog on a large repository
is the normal state of a wiki that was seeded honestly.

The alternative was tried and is worse. Make full coverage a gate, and the cheapest way to pass is
a page per file that restates its exports, which is exactly what
[the wiki must not contain](../decisions/cli-read-only.md): the code already says that, and the
copy rots. The second cheapest way to pass is one page claiming `src/`, which is why
[over-broad sources](./over-broad-sources.md) get their own warning. Both produce a green check and
a wiki nobody reads.

So the project states it twice, in prose in `AGENTS.md` — never make full coverage a precondition
for anything — and in the exit code, where a script can read it. `--strict` exists for projects
that want CI to fail on any finding, but it is opt-in. The hooks do not run coverage at all since
`aafa306`: a notifier that repeats a backlog meant to outlive every pass is never silent, and on a
real OpenCode run it put the same file list into every session's system prompt.

The ignore list is the one way this can be gamed, so the report ends with how many files it took
out. Ignoring is meant to be a conscious call recorded in a file; until that number was printed,
the difference between "this repository has 17 code files" and "this repository has 48 and the
ignore list ate 31" was invisible to everyone, including the pass that wrote the list.

What a new wiki starts with is `templates/wikipokeignore`: the wiki itself, `.wikipoke.json`, every
`*.md`, the agent folders, the lockfiles and the repository plumbing. It is a starting point the
first ingest pass is told to tailor, not a policy — and the two lines that matter most are the
ones that undo it. `*.md` is right for a repository whose product is code and wrong for one whose
product is prose, so a `!` line brings a subtree back (`templates/wikipokeignore:15`), and because
both halves are git pathspecs applied in two passes rather than gitignore rules read top to bottom,
where that line sits in the file does not matter.

Coverage earns its place by being *mechanical and finite*: it turns "is the wiki done?", which has
no answer, into a list of file clusters, which has a next step. Resolve a cluster by writing the
page it earns, or by ignoring it in `.wikipokeignore` — which is a conscious call, recorded in a
file, not silence.
