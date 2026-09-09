# Architecture

## Agent-first boundary

Wikipoke does not invoke a model provider. It is independent of Claude, Codex, OpenCode, and other hosts. The host agent owns interpretation, code reading, and editorial judgement. Wikipoke owns deterministic source inventory, planning, validation, publication, query records, decision events, graph reconstruction, checkpoints, and release records.

## Repository layout

```text
wikipoke.config.yaml       source scope and batch policy
.wikipokeignore            optional source exclusions
wiki/                      editable Markdown knowledge
  entities/ decisions/ queries/ watchlogs/
.wikipoke/
  state.json               last fully reconciled Git commit
  attention.json           latest non-blocking hook signal
  events/                  implementation decision events
  hooks/post-commit        generated notifier
  releases/                release manifests
.agents/skills/            generated host-neutral instructions
```

## CLI contract

`ingest` returns a read-only work plan. `publish` validates an agent patch against the current Git inventory. `ask` opens a query and `answer` validates citations before closure. `schema patch` and `schema answer` expose machine-readable payload contracts.

Writes use a transaction journal and a single writer lock. Recovery completes an interrupted transaction or stops on an external edit conflict.

## Skills and hook

`install` creates ingestion, query, and decision skills under `.agents/skills/`. They are provider-neutral instructions, not runtime integrations with a particular agent. A host must support the project skill convention or be configured to read those files.

The installer activates a delegating Git `post-commit` hook only when no hook exists. It preserves existing hook managers and reports manual composition instead. The notifier runs deterministic `status` and writes `.wikipoke/attention.json` for a later agent session.

## State and freshness

Each page cites a resource, Git revision, and content hash. `status` compares those records with the current inventory to report drift and uncovered sources. `seal` records `lastIndexedCommit` only when the configured scope is healthy.
