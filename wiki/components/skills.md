---
title: The skills
type: entity
responsibility: What each skill template instructs the agent to do, and the boundaries the wiki skills share.
sources:
  - templates/skills/wikipoke-ingest/SKILL.md
  - templates/skills/wikipoke-query/SKILL.md
  - templates/skills/wikipoke-lint/SKILL.md
  - templates/skills/wikipoke-agents/SKILL.md
  - templates/skills/wikipoke-implement/SKILL.md
  - templates/skills/wikipoke-decision/SKILL.md
synced: ecc7b09
related:
  - ../concepts/skills-as-product.md
  - ../flows/ingest-pass.md
  - ../decisions/capture-decisions.md
---

Six Markdown files that no Node code ever reads. They are copied into `.agents/skills/` and
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

Since `e52be54` every mode but a seed starts by draining `wiki/.inbox/`: each decision note is
checked against the project's "Decisions worth recording" bar a second time — a note that bundles
several, one decision at a time — against the code it
names, and against the decision pages already there, then becomes a new page, extends one or
supersedes one — the old page gaining `status: deprecated` once the code follows the new decision,
staying in force with a "will reverse" line while the reversal is still planned — and is deleted
right after, so a pass cut short never integrates a note twice. A
seed drains after its avenues, so the pages have something to link to. A note about code not yet
committed waits, because `synced:` has to name a commit that holds it. Dropped notes are named in
the log and in the close. Since `52980e2` and `62cc97d` it also writes the log in the Open
Knowledge Format shape — newest first, one `## YYYY-MM-DD` per day, each pass a
`* **<skill>**: …` entry — and rewrites a log in the old one-heading-per-pass shape before adding
to it, never changing what an old entry says; `wikipoke-query` and `wikipoke-lint --deep` log the
same way. And since `072403d` it reads the "Never a source" list before choosing `sources:`, so a
lock file or a registry does not make a page stale on every commit.

Since `3e94960` the skill also carries the decision-page lifecycle in its reconcile mode: a seeded
decision page leaves `decided_by:` out (`f4554ee`), because the code and the history say what was
chosen, never who, and Mode B reads every `planned: true` page against the commits since the
checkpoint, stale or not (`9c722ab`), dropping the key where the diff carries the plan out and
turning the superseded page's "will reverse" into "reversed" (`d34957f`).

Three changes came from running it on a 1,480-file Laravel app through OpenCode. Every pass now
closes with what it left, in numbers, and the next command to type (`3f36deb`): a seed that stops
at the avenues had read as done. `all` gives every cluster one pass and one log entry and resumes
from the clusters with none; it used to run "until coverage prints nothing", and chasing that zero
led the agent to widen sources to folders it had only skimmed, which the skill now forbids by name.
And since `da8898c` it says where each page type comes from — folders for entities, entry points
traced across modules for flows, `git log` and the ignored docs for decisions — because four passes
that followed coverage wrote twenty-three module pages and not one decision. That mapping used to be
the skill's own table, closed to the types wikipoke ships; `ecc7b09` made an added page type say what
goes in it: what a type holds and where its evidence is now lives under "Where each type comes from"
in `CONVENTIONS.md`, which the skill reads, and a type the project added is seeded from the evidence
its entry names (`templates/skills/wikipoke-ingest/SKILL.md:158`) — the skill's built-in table stays
only as a fallback for a copy installed before the section existed. A part can be a topic
as well as a path, so a flow a review proposed is ingested by name, and the close counts pages by
type and speaks up when flows are fewer than one per three module pages or a dozen pages hold no
decision.

**`wikipoke-query`** answers a question from the wiki first, falls back to the code, and then
offers to file the answer back. Notes waiting in `wiki/.inbox/` are leads, not answers: it never
cites them, and a `pending` notice does not make any page's citations suspect. A decision page
carries two reading caveats since `3e94960`: `planned: true` is an intent the code does not carry
out yet, and `status: deprecated` was reversed — answer from it only when saying which, and follow
the link to what replaced it. That offer is the point: it grows the wiki *where people actually
ask*, which is a better prior than where the index looks thin. It writes only on a yes, and never
moves the checkpoint. When the answer earns its own page, the type it gets — an added type included —
is chosen by what "Where each type comes from" in `CONVENTIONS.md` says the type holds
(`templates/skills/wikipoke-query/SKILL.md:71`), a section the skill reads since `ecc7b09` instead of
carrying rules of its own. Its sharpest line is the last one — for inventory questions ("every place we
do X"), never accept an answer that rests on the wiki's silence.

How it reads is what makes the wiki cheaper than the code, and `34f14a3` changed it after measuring.
Every step an agent takes re-sends the whole conversation, so an answer costs roughly its number of
steps. The first version read the wiki and then explored the source anyway, and saved nothing on a
well-commented repository. `34f14a3` made it read `index.md` and then every candidate page in one
step; `78adf3b` goes further, after triage questions on the Laravel app cost *more* with the wiki
than without it whenever the page only pointed at the code. It trusts the lines a current page
cites instead of re-reading them, and reads code by ranges when the page falls short. `eb11f31`
split the search from the reading: the grep now returns each candidate page's `responsibility:`
line and nothing else, and only the page that answers is read whole — 1,700 bytes instead of
29,165 on a 22-page wiki. The same search leaves out `log.md` and `CONVENTIONS.md`, which match
almost any term by construction and, in an alphabetical list cut at three, had crowded out the
`flows/` pages. The lever that mattered most
is filing: a detail that sent the answer back to the code counts as a gap, and a filed section is
re-read against the question — every case of every condition — because two of four early filings
left out the very fact asked for. With the gaps filed, four triage questions cost 26 to 75 % fewer
tokens than without the wiki and never opened the code. The README has the earlier numbers. `78adf3b` widened its
description from "how does X work, where does Y live" to any question about how the code behaves,
and kept every trigger phrase in English (`a02c873`). Widening was not enough: on OpenCode the
description still never fired for a plain question, so every answer was raw exploration.
`eb11f31` made it open with the imperative ("Use for every question about how this repository's
code behaves … before any grep, glob or opening a source file"), and it fired on the first try.

**`wikipoke-lint`** reads `wikipoke check` and explains it, and with `--deep` reads the pages as a
body of text through eight lenses no script can apply: contradiction, expired claim, orphan concept,
density, gap, missing kind, confidence, and, since `3e94960`, planned decisions — drop `planned:`
where the code now does what the page says; ask the person when a plan sits that nobody carries
out any more. Missing kind, since `86294e6`, counts pages by type and
looks for what coverage cannot ask for — an entry point no flow follows, a design choice buried in a
module page or in `git log` — and proposes each as a `wikipoke-ingest "<topic>"` command; on the
Laravel app it produced the wiki's first two decision pages. Since `ecc7b09` the lens also reads
"Where each type comes from" two ways: a type the project added whose evidence sits in the
repository with no page of it — deploy scripts and no runbook — is itself a proposal
(`templates/skills/wikipoke-lint/SKILL.md:73`), and a row in the page-types table with no entry
under that section is a finding on its own, because no skill then knows what goes in the type. The same change made an over-broad
warning keep the coverage total false while it stands, after a review called seven of them known
debt and the coverage complete. Its expired-claim lens opens the citations a page already carries, because `check` knows a cited
line exists, not that it still says what the sentence claims. It proposes and does not rewrite —
reconciling is ingest's job — and
`--fix-trivial` is the narrow exception for broken links and missing index lines. Two rules keep it
from generating noise: a finding you cannot back with a page quote or a `path:line` is an opinion,
and "no findings" is a real outcome. Pending decision notes are debt like staleness, and its fix is
an ingest before the branch or worktree goes away, since the notes live only in that working copy.

The ingest skill also says what to do when wikipoke itself was upgraded: `wikipoke init`, which
refreshes the skills and lists the outdated hooks, then ask before updating a hook — never copy the
templates by hand.

**`wikipoke-decision`**, since `3e94960`, is how a decision a person took becomes a page without
passing through the inbox. The person's words are the source — what was chosen, what was set aside
and why — and the skill asks for whichever is missing, one short question at a time; a "no
alternative" after asking is answered honestly with there being no decision, only a rule that
belongs in `AGENTS.md` (`/wikipoke-agents`). It reads the wiki to write new, extend or supersede,
and reads the code to say which of three things is true: the code already does it, the code does
not yet (`planned: true`, its `sources:` the files the change will touch), or the code says
otherwise — and that last one is the person's call, never the skill's. It writes
`decided_by: person` at `confidence: high`, shows the whole draft before writing, touches neither
the checkpoint nor `.inbox/`, and is why the wiki holds
[the viewer decision](../decisions/own-viewer.md) straight from Daniel. A choice smaller than the
bar is still recorded when the person asks: the bar governs what agents note on their own, not what
a person keeps.

**`wikipoke-implement`**, since `e52be54`, is the one skill that writes code. It implements what
the person asked for, unchanged, and notes in `wiki/.inbox/` each decision that clears the
project's bar, at the moment it is made, without reading the rest of the wiki, and sweeps its
diff before closing for one it moved past. It never writes a page. It runs only when a person names it: its description says so and its frontmatter carries
`disable-model-invocation`, because a skill that fired on every "implement X" would compete with
every other way of implementing. The `decisions` hook asks the same of every agent through
`AGENTS.md`; both point at the same section of `CONVENTIONS.md`
([the decision](../decisions/capture-decisions.md)).

**`wikipoke-agents`**, experimental, is the one skill that does not touch the wiki and does not
need one. It audits or writes the repository's `AGENTS.md`, plus a nested one only where a
subdirectory has rules the root file does not, and the result never mentions wikipoke. Its unit
is the *statement*, not the line or the bullet: each one stays only if an agent would get
something wrong without it, the repository backs it up (a script, a config value, a `fix` commit,
a rule a person wrote), and one `ls` or `grep` would not find it. It verifies the statements it
keeps from an existing file as well as the new ones: an agent asked for a `CLAUDE.md` without it,
in a trial on this repository, copied a false statement from the old file, wrote a directory tour,
and dropped a rule the person had written. The content always goes in `AGENTS.md`, with
`CLAUDE.md` reduced to an `@AGENTS.md` import, so every agent reads one file. It writes outside the
wiki, so its guard is different: every change is shown as a unified diff, created files included,
and nothing is written until the person says yes to that diff.

Four boundaries the four wiki skills repeat, because a skill is read by an agent that has not
read the others (`wikipoke-agents` keeps only the first; `wikipoke-implement` writes code, so it
keeps only the last two, and touches nothing in the wiki but the inbox; `wikipoke-decision` carries
the four as steps of its own workflow — the schema read before anything, the code never changed):

- **Never modify code.** The pass touches `wiki/**` and nothing else — running a generator counts.
  A bug found on the way is noted on the page and reported to the person.
- **Never re-stamp `synced:` without re-reading the page against the code.** That field is the only
  guarantee the wiki is not lying.
- **Read `CONVENTIONS.md` first.** The schema lives in the wiki, not in the skill.
- **Write as you go**, one page at a time. Reading you are not about to turn into a page is spent
  twice.
