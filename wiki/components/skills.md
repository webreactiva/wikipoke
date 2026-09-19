---
title: The three skills
type: entity
responsibility: What each skill template instructs the agent to do, and the boundaries all three share.
sources:
  - templates/skills/wikipoke-ingest/SKILL.md
  - templates/skills/wikipoke-query/SKILL.md
  - templates/skills/wikipoke-lint/SKILL.md
synced: 78adf3b
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
that pass, and a reconcile re-points every citation drift reports — on stale pages and on the
fresh ones it lists under `moved[]` — before it re-stamps a page.
`3eb714c` extended the first to `sources:` — a file only named is left for coverage to report, not
claimed — after a seed listed two files it never opened and hid them from the backlog.
[The full pass is a flow](../flows/ingest-pass.md).

Three changes came from running it on a 1,480-file Laravel app through OpenCode. Every pass now
closes with what it left, in numbers, and the next command to type (`3f36deb`): a seed that stops
at the avenues had read as done. `all` gives every cluster one pass and one log entry and resumes
from the clusters with none; it used to run "until coverage prints nothing", and chasing that zero
led the agent to widen sources to folders it had only skimmed, which the skill now forbids by name.
And since `da8898c` it says where each page type comes from — folders for entities, entry points
traced across modules for flows, `git log` and the ignored docs for decisions — because four passes
that followed coverage wrote twenty-three module pages and not one decision. A part can be a topic
as well as a path, so a flow a review proposed is ingested by name, and the close counts pages by
type and speaks up when flows are fewer than one per three module pages or a dozen pages hold no
decision.

**`wikipoke-query`** answers a question from the wiki first, falls back to the code, and then
offers to file the answer back. That offer is the point: it grows the wiki *where people actually
ask*, which is a better prior than where the index looks thin. It writes only on a yes, and never
moves the checkpoint. Its sharpest line is the last one — for inventory questions ("every place we
do X"), never accept an answer that rests on the wiki's silence.

How it reads is what makes the wiki cheaper than the code, and `34f14a3` changed it after measuring.
Every step an agent takes re-sends the whole conversation, so an answer costs roughly its number of
steps. The first version read the wiki and then explored the source anyway, and saved nothing on a
well-commented repository. `34f14a3` made it read `index.md` and then every candidate page in one
step; `78adf3b` goes further, after triage questions on the Laravel app cost *more* with the wiki
than without it whenever the page only pointed at the code. It now searches and reads the pages in
one call (`grep -ril … | head -3 | xargs cat`), trusts the lines a current page cites instead of
re-reading them, and reads code by ranges when the page falls short. The lever that mattered most
is filing: a detail that sent the answer back to the code counts as a gap, and a filed section is
re-read against the question — every case of every condition — because two of four early filings
left out the very fact asked for. With the gaps filed, four triage questions cost 26 to 75 % fewer
tokens than without the wiki and never opened the code. The README has the earlier numbers. The same commit widened its
description from "how does X work, where does Y live" to any question about how the code behaves,
and kept every trigger phrase in English (`a02c873`).

**`wikipoke-lint`** reads `wikipoke check` and explains it, and with `--deep` reads the pages as a
body of text through seven lenses no script can apply: contradiction, expired claim, orphan concept,
density, gap, missing kind, confidence. Missing kind, since `86294e6`, counts pages by type and
looks for what coverage cannot ask for — an entry point no flow follows, a design choice buried in a
module page or in `git log` — and proposes each as a `wikipoke-ingest "<topic>"` command; on the
Laravel app it produced the wiki's first two decision pages. The same change made an over-broad
warning keep the coverage total false while it stands, after a review called seven of them known
debt and the coverage complete. Its expired-claim lens opens the citations a page already carries, because `check` knows a cited
line exists, not that it still says what the sentence claims. It proposes and does not rewrite —
reconciling is ingest's job — and
`--fix-trivial` is the narrow exception for broken links and missing index lines. Two rules keep it
from generating noise: a finding you cannot back with a page quote or a `path:line` is an opinion,
and "no findings" is a real outcome.

The ingest skill also says what to do when wikipoke itself was upgraded: `wikipoke init`, which
refreshes the skills and lists the outdated hooks, then ask before updating a hook — never copy the
templates by hand.

Four boundaries every one of them repeats, because a skill is read by an agent that has not read
the others:

- **Never modify code.** The pass touches `wiki/**` and nothing else — running a generator counts.
  A bug found on the way is noted on the page and reported to the person.
- **Never re-stamp `synced:` without re-reading the page against the code.** That field is the only
  guarantee the wiki is not lying.
- **Read `CONVENTIONS.md` first.** The schema lives in the wiki, not in the skill.
- **Write as you go**, one page at a time. Reading you are not about to turn into a page is spent
  twice.
