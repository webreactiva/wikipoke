# Tracker sync

Optional. Only relevant when `.claude/gate-driven.json` has a `tracker`.

**If the project has its own workflow skill for its tracker, use that instead of anything here.** It knows the project's labels, milestones, iteration fields and MR conventions; these recipes are the fallback for projects that have none.

## The division of truth

Two systems, one rule that stops them drifting:

- **The cycle directory is the truth for content** — what was asked, decided, planned, proven.
- **The tracker is the truth for status** — what state the work is in, who owns it.

Anything else duplicates. Do not mirror `spec.md` into an issue description; link to it. A copy is a second source of truth that goes stale on the first edit, and then nobody knows which one a reviewer read.

## The two-way link, once

When the cycle opens, connect them and then leave it alone:

- The issue gets one comment naming the cycle path (and the commit SHA, if artifacts are committed).
- `state.md` frontmatter gets `tracker: gitlab#1014`.

After that, only status moves between them.

## Phase to status

Map the cycle's phase onto whatever the tracker already uses; do not invent a parallel vocabulary. A reasonable default:

| Phase | Typical tracker status |
|-------|------------------------|
| plan, design | open / refinement |
| build | in progress |
| test | in progress |
| deploy | in review |
| gate passed | closed on merge |

Move status **when the gate is recorded**, not when the work feels done. That keeps the two records consistent — a tracker that says "in review" while `state.md` shows an open build gate is a bug in the process.

## GitLab (`glab`)

```bash
glab auth status                                   # confirm before offering sync
glab issue view 1014                               # read the ask
glab issue note 1014 -m "Cycle: docs/sdlc/utm-inheritance/ (spec accepted)"
glab issue update 1014 --label "status::in progress" --unlabel "status::open"
glab mr create --fill --draft --description-file <(cat body.md)
glab mr view --web
```

The status vocabulary is project-specific (`status::`, `workflow::`, board lists). Read the existing labels with `glab label list` before setting one, rather than creating a near-duplicate.

## GitHub (`gh`)

```bash
gh auth status
gh issue view 1014
gh issue comment 1014 --body "Cycle: docs/sdlc/utm-inheritance/ (spec accepted)"
gh issue edit 1014 --add-label "in progress" --remove-label "ready"
gh pr create --fill --draft --body-file body.md
gh pr view --web
```

## What never syncs automatically

- **Gate decisions.** They are recorded when a human gives them, in `state.md`. Posting "accepted" to a tracker because the phase advanced would fabricate an approval.
- **Closing an issue.** The merge closes it, or a person does.
- **Anything that notifies people.** Assigning reviewers, pinging a channel, requesting review — those reach humans, so ask first. Reading is free; writing is visible to other people.
