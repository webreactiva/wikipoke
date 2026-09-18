---
title: The three skills
type: entity
responsibility: What each skill template instructs the agent to do, and the boundaries all three share.
sources:
  - templates/skills/wikipoke-ingest/SKILL.md
  - templates/skills/wikipoke-query/SKILL.md
  - templates/skills/wikipoke-lint/SKILL.md
synced: 3eb714c
related:
  - ../concepts/skills-as-product.md
  - ../flows/ingest-pass.md
---

Three Markdown files that no Node code ever reads. They are copied into `.agents/skills/` and
`.claude/skills/` alike — since `08177b5` both, always, because Claude Code reads only the second
and nothing in a repository reliably says it is used — an agent follows them, and the wiki appears.
Most of wikipoke's behaviour is here rather than in `src/lib/`; see
[why that is the design](../concepts/skills-as-product.md) and
[why a skill needs no permission and a hook does](../concepts/file-ownership.md).

**`wikipoke-ingest`** takes code into the wiki, and picks one of three modes from the arguments and
the filesystem: an argument means *ingest that part*, no argument and no `.wikipoke-state.json`
means *seed*, no argument with a checkpoint means *reconcile*. Only seeding and reconciling move the
checkpoint — closing a coverage gap says nothing about the repository being indexed up to HEAD — and
since `aafa306` they write it with a `printf` around `git rev-parse HEAD` rather than letting the
agent copy a sha. The same change added two citation rules: a seed cites only files it opened in
that pass, and a reconcile re-points the `citations[]` drift reports before it re-stamps a page.
`3eb714c` extended the first to `sources:` — a file only named is left for coverage to report, not
claimed — after a seed listed two files it never opened and hid them from the backlog.
[The full pass is a flow](../flows/ingest-pass.md).

**`wikipoke-query`** answers a question from the wiki first, falls back to the code, and then
offers to file the answer back. That offer is the point: it grows the wiki *where people actually
ask*, which is a better prior than where the index looks thin. It writes only on a yes, and never
moves the checkpoint. Its sharpest line is the last one — for inventory questions ("every place we
do X"), never accept an answer that rests on the wiki's silence.

**`wikipoke-lint`** reads `wikipoke check` and explains it, and with `--deep` reads the pages as a
body of text through six lenses no script can apply: contradiction, expired claim, orphan concept,
density, gap, confidence. Its expired-claim lens opens the citations a page already carries, because `check` knows a cited
line exists, not that it still says what the sentence claims. It proposes and does not rewrite —
reconciling is ingest's job — and
`--fix-trivial` is the narrow exception for broken links and missing index lines. Two rules keep it
from generating noise: a finding you cannot back with a page quote or a `path:line` is an opinion,
and "no findings" is a real outcome.

Four boundaries every one of them repeats, because a skill is read by an agent that has not read
the others:

- **Never modify code.** The pass touches `wiki/**` and nothing else — running a generator counts.
  A bug found on the way is noted on the page and reported to the person.
- **Never re-stamp `synced:` without re-reading the page against the code.** That field is the only
  guarantee the wiki is not lying.
- **Read `CONVENTIONS.md` first.** The schema lives in the wiki, not in the skill.
- **Write as you go**, one page at a time. Reading you are not about to turn into a page is spent
  twice.
