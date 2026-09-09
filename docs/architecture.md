# Architecture

## Agent-first boundary

Wikipoke does not invoke a model provider. It is independent of Claude, Codex, OpenCode, and other hosts. The host agent owns interpretation, code reading, and editorial judgement. Wikipoke owns deterministic source inventory, planning, validation, publication, query records, decision events, graph reconstruction, checkpoints, and release records.

## Repository layout

```text
wikipoke.config.yaml       source scope and batch policy
.wikipokeignore            optional source exclusions, adopted at init
wiki/                      editable Markdown knowledge
  entities/ decisions/ queries/ watchlogs/
.wikipoke/
  state.json               last fully reconciled Git commit
  attention.json           latest compact hook signal
  transaction.json         in-flight write journal, removed on completion
  write.lock/              single writer lock, with owner.json
  events/                  implementation decision events
  hooks/post-commit        generated notifier
  releases/                release manifests
.agents/skills/            generated host-neutral instructions
```

## CLI contract

`ingest` returns a read-only work plan. `publish` validates an agent patch against the current Git inventory; a patch may pin the `revision` it was planned against and is refused when the sources have moved. `ask` opens a query and `answer` validates citations before closure: an answer needs cited evidence, or explicitly declared gaps, in which case the query closes as `unsupported` rather than `answered`. `answered` is terminal — a further answer is refused instead of replacing the record — while `pending` and `unsupported` remain answerable. `schema patch` and `schema answer` expose machine-readable payload contracts.

The source inventory reads the whole scope through one batched `git cat-file` process rather than one process per file, so a thousand-file scope stays well under a second end to end.

## Writes and concurrency

Writes use a transaction journal and a single writer lock. Recovery completes an interrupted transaction or stops on an external edit conflict. `recover --unlock` releases a lock left by a dead process and reports the recorded owner.

The read commands `status`, `lint`, and `graph` take the same lock, so two Wikipoke commands running at once on one repository fail with a lock error. `graph` reads only the wiki; it does not recompute the source inventory.

A Markdown file the parser cannot read — malformed frontmatter, or none — is reported as an `invalid-page` finding. Every other command keeps working, and `publish` refuses to overwrite the file rather than replacing a human's unparseable edit. A symlink inside the wiki is skipped silently instead: it is never loaded as a page and never produces a finding, and publishing to its path is refused.

## Skills and hook

`install` creates ingestion, query, and decision skills under `.agents/skills/`. They are provider-neutral instructions, not runtime integrations with a particular agent. A host must support the project skill convention or be configured to read those files.

The installer activates a delegating Git `post-commit` hook only when no hook exists. That delegator resolves the repository root at run time instead of embedding an absolute path, so a clone or a moved checkout keeps working. When a hook already exists the installer preserves it and reports the manual composition step instead.

The notifier runs `maintain --once`, which writes `.wikipoke/attention.json` itself. It resolves the CLI from `node_modules/.bin/wikipoke`, then `npx --no-install wikipoke`, and exits silently when neither is available; a failed run leaves the previous signal in place. `uninstall` removes only what `install` created, leaving the wiki, configuration, events, releases, and any foreign hook untouched.

## State and freshness

Each page cites a resource, Git revision, and content hash; source text itself is never stored in a page. `status` compares those records with the current inventory to report drift and uncovered sources. `attention.json` is a compact derivative of that report — counts plus a bounded sample — not a full dump.

`seal` records `lastIndexedCommit` only when the configured scope has no uncovered source, no drifted reference, and no error finding.

## Not implemented

The following are absent, not merely undocumented. `README.md` carries the full list of known limits.

Nothing detects divergence between a recorded decision and later implemented behavior, and there is no record of conflicting claims about the same scope: specification requirements FR-008 and FR-009 have no implementation. There is no importer for the two existing wikis (FR-014). Snapshots are write-only: `snapshot` stores refs and a manifest, but no command reads one back, and historical questions go through `ask --ref <commit>`. `publish` cannot delete or deprecate a page.
