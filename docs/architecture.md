# Architecture

## Agent-first boundary

Every command except `ingest` works from identities and digests alone, never from
source text: coverage, drift and patch verification all ask "is this the same
content", which a hash answers. Only planning reads code, and only the batch it
plans. Blobs are read a group at a time and a source nobody asked for is hashed
from its bytes without ever being decoded, so the peak is one group rather than
the repository — 127 MB rather than 315 MB on a 75 MB tree.

Wikipoke does not invoke a model provider. It is independent of Claude, Codex, OpenCode, and other hosts. The host agent owns interpretation, code reading, and editorial judgement. Wikipoke owns deterministic source inventory, planning, validation, publication, query records, decision events, graph reconstruction, and checkpoints.

## Repository layout

```text
wikipoke.config.yaml       source scope and batch policy
.wikipokeignore            optional source exclusions, adopted at init
wiki/                      editable Markdown knowledge
  index.md                 generated map of what the project knows
  log.md                   generated chronology of what changed in the code, and why
  entities/ flows/ concepts/ decisions/ queries/
.wikipoke/
  state.json               last fully reconciled Git commit
  attention.json           latest compact hook signal
  transaction.json         in-flight write journal, removed on completion
  write.lock/              single writer lock, with owner.json
  events/                  implementation decision events
  events/archive/          closed tasks folded into one JSONL per month
  hooks/post-commit        generated notifier
  hooks/session-start      generated agent briefing
.agents/skills/            generated host-neutral instructions
.claude/skills/            the same skills, where Claude Code looks for them
```

## CLI contract

`ingest` returns a read-only work plan, bounded by the configured limits and drawn from one directory where it can; `--path` aims it at a part of the repository that never appeared in a diff. `publish` takes a directory of Markdown pages whose `sources` are patterns — a directory, a glob, or one file path — resolves each against the inventory at the commit named by `--ref`, and writes the revision and digest into the page itself. It is refused when any file matching those patterns changed between that commit and now. `ask` opens a query and `answer` validates citations before closure: an answer needs cited evidence, or explicitly declared gaps, in which case the query closes as `unsupported` rather than `answered`. `answered` is terminal — a further answer is refused instead of replacing the record — while `pending` and `unsupported` remain answerable. `lint --pages <directory>` runs every one of those checks without writing, so a rejected page costs a check rather than a failed publication. `schema page`, `schema answer` and `schema event` expose machine-readable contracts, and `schema page` carries a worked example of the file itself.

The source inventory reads the whole scope through one batched `git cat-file` process rather than one process per file, so a thousand-file scope stays well under a second end to end.

## Extensions

A project attaches its own scripts to points in Wikipoke's lifecycle by declaring them in `wikipoke.config.yaml` under `extensions`. Each entry names an `event`, a shell command to `run`, an optional `timeout`, and — on a `.before` event only — whether it is `blocking`. The script receives the event as one JSON object on stdin, runs from the project root, and answers with its exit status.

They are declared rather than discovered. A directory whose contents run is a directory anything can be dropped into, and `doctor` could never report which of those files was meant to be there; as configuration, the attached set is listed by `doctor` and any unreadable entry is named as a problem.

Extensions are dispatched in the CLI, on either side of the command, never inside the writer lock. A script called with the lock held would be handed a lifecycle event and a tool that answers `Wiki writer locked` — an instruction it cannot carry out — so an extension is free to run Wikipoke commands of its own. An observer that fails is reported on stderr and never fails the command it was watching; a blocking extension that fails refuses the action before anything is written.

The payload is a summary of the command, never its output: an `ingest` plan carries the text of every source in its batch, and piping that into every extension on every pass is the cost the surface exists to avoid. The full event table is in [extensions](./extensions.md).

## Writes and concurrency

Writes use a transaction journal and a single writer lock. Recovery completes an interrupted transaction or stops on an external edit conflict. `recover --unlock` releases a lock left by a dead process and reports the recorded owner.

The read commands `status`, `lint`, and `graph` take the same lock, so two Wikipoke commands running at once on one repository fail with a lock error. `graph` reads only the wiki; it does not recompute the source inventory.

A Markdown file the parser cannot read — malformed frontmatter, or none — is reported as an `invalid-page` finding. Every other command keeps working, and `publish` refuses to overwrite the file rather than replacing a human's unparseable edit. A symlink inside the wiki is skipped silently instead: it is never loaded as a page and never produces a finding, and publishing to its path is refused.

## Skills and hook

`install` creates ingestion, query, and decision skills under `.agents/skills/`. They are provider-neutral instructions, not runtime integrations with a particular agent. A host must support the project skill convention or be configured to read those files — OpenCode reads that location, Claude Code does not, so the same files are written under `.claude/skills/` as well. Intermediate JSON that the skills tell an agent to write goes under `.wikipoke/tmp/`, which is git-ignored and inside the project, because anywhere outside it is a sandbox boundary in most harnesses.

The installer activates a delegating Git `post-commit` hook only when no hook exists. That delegator resolves the repository root at run time instead of embedding an absolute path, so a clone or a moved checkout keeps working. When a hook already exists the installer preserves it and reports the manual composition step instead.

The briefing at `.wikipoke/hooks/session-start` closes the other half of the loop: the notifier keeps the signal fresh, the briefing puts it in front of the agent, printing one line when the wiki owes work and nothing when it does not. Wikipoke composes it into `.claude/settings.json` only when that file is absent; every other harness gets a reported step rather than an edited config, because a harness config carries permissions and plugins that are not Wikipoke's to rewrite.

The notifier runs `maintain --once`, which writes `.wikipoke/attention.json` itself. It resolves the CLI from `node_modules/.bin/wikipoke`, then `npx --no-install wikipoke`, and exits silently when neither is available; a failed run leaves the previous signal in place. `uninstall` removes only what `install` created, leaving the wiki, configuration, events, and any foreign hook untouched.

## State and freshness

Each page cites one or more source patterns with the Git revision and the digest of what each matched; source text itself is never stored in a page. `status` compares those records with the current inventory on two independent axes: a file is **covered** when some page pattern claims it, and a page has **drifted** when the digest of what its pattern matches no longer agrees with what it recorded. Keeping them separate is what stops one edited file inside a module reporting every file in that module as undocumented. `attention.json` is a compact derivative of that report — counts plus a bounded sample — not a full dump. It carries the health of the wiki against the code and nothing about what an agent did during a turn — including a count of in-scope files edited but not committed, which is the one debt that exists before any commit hook has a reason to run.

`seal` records `lastIndexedCommit` only when the configured scope has no uncovered source, no drifted reference, and no error finding.

## Not implemented

The following are absent, not merely undocumented. `README.md` carries the full list of known limits.

Nothing detects divergence between a recorded decision and later implemented behavior, and there is no record of conflicting claims about the same scope. There is no importer for the two existing wikis. There is no release capture: a past state is a commit, and historical questions go through `ask --ref <commit>`. `publish` cannot delete or deprecate a page.
