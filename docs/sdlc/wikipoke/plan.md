# Implementation plan: Wikipoke

Status: draft; common implementation planned, executor selection pending.
From: [accepted specification](./spec.md), 2026-09-08.
Gate: human build approval required before application changes.

## Scope and decisions

Implement FR-001 through FR-015 as one library/CLI with independently testable
source, knowledge, execution, and integration boundaries. Delivery steps below
are internal milestones, not a reduction of the accepted scope. Importers,
query retention, decision capture, and release history remain part of completion.

Proposed technical baseline: TypeScript, Node, npm, one package with public
library exports and a `wikipoke` executable. This follows the proposal and the
existing JavaScript engines; approval of this plan will settle the baseline.
Select and pin maintained YAML, Markdown AST, glob, and CLI parsing dependencies
after checking their supported runtime and licenses during scaffolding. Do not
recreate specialized YAML or Markdown parsers. Use a deterministic test harness
and fake executor for the core, plus a real-executor acceptance pass.

No application code, package manifest, test harness, or installed product hooks
exist in this repository. Existing instructions and the installed governance
skill remain tooling for this cycle, not product runtime dependencies.

### Decision frontier

| Bucket | Item |
| --- | --- |
| Decided | The design is accepted; every query is retained; implementation choices are captured; history uses Git; the build gate remains human. |
| Open, O-002 | Daniel must select the first execution integration. Until then, the execution contract can be planned but concrete provider wiring cannot be finalized. |
| Decided, O-001 | Daniel selected automatic activation. Completing executor, allowed scope, limits, and execution-environment configuration activates maintenance without an additional opt-in. Missing prerequisites remain visible. |
| Proposed | One package, local files as canonical knowledge, rebuildable indexes, and one writer per target wiki. |
| Investigation required | Verify the selected executor's supported invocation, output, cancellation, and lifecycle hooks before fixing its concrete integration plan. No installed CLI or credentials have been assumed. |

O-003 is per-installation configuration. Require an explicit source scope and
resource limits for unattended work; interactive setup may suggest values but
must record the selected values. No unlimited unattended default is proposed.

## Files and responsibilities

All paths below are new unless noted. Keep implementation under `src/`, matching
tests under `tests/`, fixtures under `tests/fixtures/`, and compiled output out
of Git. Create files when their milestone starts, not as empty scaffolding.

| Files | Responsibility |
| --- | --- |
| `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore` | Runtime/build contract, dependencies, scripts, generated-file exclusions |
| `src/index.ts`, `src/cli.ts` | Public API exports and command dispatch, structured errors and JSON output |
| `src/config.ts`, `src/model.ts` | Validated configuration, versioned knowledge/event/job contracts |
| `src/knowledge/{parse,write,validate}.ts` | OKF/profile parsing, unknown-field preservation, canonical writing, useful diagnostics |
| `src/knowledge/{graph,index}.ts` | Graph construction, reverse links, IDs/aliases, index generation |
| `src/sources/{types,git}.ts` | Versioned source inventory, allowed paths, code reads, revision comparison |
| `src/runtime/{store,queue,transaction,budget}.ts` | Durable inputs, replay, locks, recoverable publication, resource accounting |
| `src/operations/{ingest,status,review}.ts` | Bootstrap, impact planning, reconciliation and health findings |
| `src/operations/query.ts`, `src/retrieval/search.ts` | Query persistence, ranked context selection, citations and historical scope |
| `src/capture/{events,tasks,decisions}.ts` | Event ingestion, task opening/closure, decision and implementation-log publication |
| `src/knowledge/conflicts.ts` | Claim conflicts, conformance checks, resolution evidence |
| `src/execution/types.ts`, selected adapter file | Structured execution contract and selected real executor; file finalized under O-002 |
| `src/integrations/{install,doctor,hooks}.ts`, `templates/skills/` | Reversible installation, capability checks, capture/maintenance entry points |
| `src/history/snapshot.ts` | Exact revision capture, retained refs, manifests, immutable historical reads |
| `src/importers/{widgetron,webreactiva}.ts` | Non-destructive migration, fidelity reports, legacy link resolution |
| `tests/{knowledge,git,runtime,query,capture,history,integration}/` | Behavioral tests, failure injection, isolated Git repositories and consumer projects |
| `README.md`, `docs/{installation,format,operations}.md` | English user documentation for actually delivered behavior |
| `docs/sdlc/wikipoke/{plan,journal,evidence,state}.md` | Update this plan/state; start journal during implementation; record executed evidence later |

## Implementation sequence

### 1. Establish contracts and portable knowledge

Create package/build scripts and define library boundaries. Document the exact
OKF version/profile mapping before implementing readers and writers. Keep
standard fields distinct from Wikipoke extensions; concept path remains public
identity and an internal immutable UID tracks moves.

Parse YAML and Markdown structurally, preserve unrecognized keys and user text,
and diagnose invalid content without silently defaulting away missing fields.
Define semantic relations separately from prose links and source references.
Build incoming edges from declarations, normalize symmetric edges, and validate
type-specific cycles and targets. Generate indexes and relationship sections
without rewriting unrelated body content. (FR-001, FR-003, FR-004, FR-012)

### 2. Implement source revisions and mechanical health

Use argument-array Git subprocesses with explicit repository paths. Inventory
tracked files inside configured scope and compare pinned commits, including old
and new paths for renames/deletions. Snapshot source hashes; separate optional
working-tree inputs from committed inputs and include permitted untracked files
only in the former. Do not read secrets or paths escaping scope through symlinks.

Group revisions to avoid one Git subprocess per page. Resolve missing/shallow
history through available hashes or a visible rescan requirement. Distinguish
observed inventory, reconciled changes, per-page verification, and initial
coverage backlog. Build status/lint without an executor. (FR-002, FR-003, FR-015)

### 3. Build durable capture and recoverable writes

Persist accepted query/task/decision events before generation. Pending events
are durable input, not cache; keep them until their wiki representation is
published. Scope runtime identities by source repository/worktree and use a
shared lock for a shared output bundle, even across distinct source branches.

Implement a journaled transaction with staged proposed files, expected original
hashes, revision checks, and recoverable phases. Readers use the committed
transaction generation or wait/recover rather than observe a partially published
batch. Crash recovery only restores files still matching transaction-owned hashes;
unexpected external edits create a conflict instead of being overwritten.
Advance checkpoints last. Deduplicate by event/job identity, never by query text.
Keep retries and exhaustion visible. (FR-006, FR-007, FR-010, FR-015)

### 4. Wire the selected executor and incremental ingestion

The execution boundary accepts bounded source/context payloads and returns
validated patches, review findings, or cited answers. It does not grant an LLM
unrestricted filesystem write authority. Implement timeouts, cancellation,
output limits, schema rejection, and available usage accounting. Reject unknown
evidence IDs and writes outside allowed knowledge/state paths.

Complete the provider-specific invocation and lifecycle mapping after O-002.
A fake adapter alone is insufficient to complete this milestone or claim an
operational autonomous product. If a configurable-command adapter is selected,
specify stdin/stdout JSON and exit semantics, provide a usable real-model bridge,
and verify it; simply asking users to invent a bridge does not fulfill bootstrap.

Bootstrap a map and coverage jobs, then reconcile bounded source clusters and
dependency candidates. Treat inferred impacts as candidates, not unconditional
rewrite instructions. A no-op review can record updated verification without
changing the prose. Exclude generated artifacts from source-trigger loops while
retaining explicit query/decision events. (FR-002, FR-003, FR-013, FR-015)

### 5. Deliver recorded, grounded queries

Create the pending query page before model execution; fail visibly if persistence
is impossible. Search titles/descriptions/body with deterministic text ranking,
expand bounded graph neighbors, and read source evidence as needed within scope.
Record delivered text, citations, consulted revision IDs, and completion outcome.
Separate historical answer records from current explanatory pages in retrieval.

Interrupted requests become recoverable pending/failed records. A retry shares
identity while a new invocation does not. Validate citation existence and pinned
locators mechanically; semantic support requires review/evaluation, not just
link resolution. Persist the answer before reporting successful completion.
(FR-005, FR-006)

### 6. Materialize decisions, conformance, and conflicts

Convert task events into implementation logs and independently useful decision
pages, preserving original declarations and links. Distinguish submission,
materialization, task closure, implementation evidence, and human review.
Map interrupted/missing closure to incomplete capture; explicit no-decision
declarations require attribution and remain declarations rather than proofs.

Track decision lifecycle separately from conformance against a revision. Record
claim-level conflicts with scope and evidence, retain resolution history, and
surface unresolved conflicts during queries. Restrict automatic corrections to
evidenced documentary errors under the accepted policy; project decisions remain
pending for their owner. Never recover motives by inventing them from code.
(FR-007, FR-008, FR-009, FR-010, FR-012)

### 7. Install into isolated consumer projects

Implement init/install, capture, maintain-once, and doctor entry points. Install
managed configuration/skills and supported hooks while recording ownership and
original integration state. Respect existing hook managers and hooks paths;
where automatic composition cannot be verified, offer the exact manual wiring
and report that capability as inactive. Never claim installed hooks exist merely
because files were generated.

Hooks persist/queue quickly without LLM calls. A worker invoked by a scheduler
performs discovery and maintenance; document and verify at least one working
scheduled invocation. Session-only operation is reported separately. Test
reinstallation and uninstall against pre-existing hooks and manual edits to
managed entries. Apply the resolved O-001 default: activate maintenance when
required configuration is complete, without a separate enable command. Verify
that incomplete setup reports the missing capability and does not claim active
maintenance. This product default does not self-approve development-cycle gates.
(FR-002, FR-007, FR-010, FR-013, FR-015)

### 8. Capture history and import the two wikis

Pin source and wiki commits; require committed snapshot content. Preserve durable
refs before publishing the release manifest, and write the manifest in a later
commit to avoid a self-reference. Report incomplete reconciliation/conflicts in
the snapshot's health. Historical reads use pinned objects, never source HEAD;
new query records go into the active wiki. Missing historical material is explicit.

Import the two legacy formats to new destinations, preserving originals. Convert
Widgetron source patterns into inventory plus future-discovery rules; preserve
inherited verification as inherited. Parse Web Reactiva citations/moments and
normalize reciprocal links without guessing dependency types. Compare all input
elements against output counts and diagnostics. Use sanitized representative
fixtures in this repository, and read sibling repos only for local acceptance.
(FR-011, FR-014)

### 9. Verify the installed product and document evidence

Build/package the CLI, install the package artifact into a disposable consumer,
run the end-to-end scenarios below, and exercise the selected real executor.
Record actual commands, output, observed limits, and budget usage in evidence.md.
Read journal.md when composing evidence so departures and dead ends are covered.
Update docs to match actual commands and runtime support. Present the Test gate;
do not claim release readiness from unit tests alone.

## Proof and failure cases

| Suite | Evidence required | Spec scenarios |
| --- | --- | --- |
| Knowledge | Round trips preserve unknown fields/prose; graph rebuild, rename, cycle and direction tests; invalid YAML/link diagnostics | S2, S11, S13 |
| Git | Temporary repos with additions, renames, deletions, untracked edits, rebases, shallow history, distinct worktrees | S1-S3, S13 |
| Runtime | Fault injection before/after each publication phase; two writers and manual edits; retry deduplication; source change during inference | S4, S5, S12, S16 |
| Queries | Model success/failure/cancellation; pending record first; repeated text vs same request; evidence validation and disclosure | S4, S5, S10 |
| Decisions | Recorded, explicitly empty and missing closure; missing rationale; proposed vs implemented vs diverged; conflict preservation/resolution | S6-S9 |
| History | Separate code/wiki commits, moving tags, retained refs, unavailable external versions, immutable snapshot queries | S10 |
| Importers | Original/output source, moment and relationship accounting; malformed input remains reported; originals unchanged | S14 |
| Consumer install | Automatic activation on completed setup without another opt-in; incomplete setup reports missing prerequisites; existing hooks/managers, twice-install/uninstall, manual managed-entry edits, absent executor, invocation outside an agent session | S1, S15, S16 |
| Real executor | Empty repo wiki -> bootstrap -> code change -> reconciliation -> cited recorded query -> captured decision -> release snapshot | S1, S2, S4, S6, S10 |

During scaffolding provide `npm run typecheck`, `npm test`, and `npm run build`.
Run focused suites after each relevant milestone, then the complete suite and
package smoke test at completion. Use a small reference-question set with known
source revisions and expected evidence. Record citation accuracy, missing affected
pages, irrelevant rewrites, and measured cost; do not invent a semantic quality
threshold or substitute a fake model result for real-model evidence.

## Risks and boundaries

- No existing runtime callers are affected inside this repository. Consumer
  repositories are affected by installation; tests use disposable projects first.
- A Git SHA alone cannot certify working-tree knowledge. Preserve the input kind
  and content hashes rather than falsely stamping uncommitted input as a commit.
- Query/log growth can dominate retrieval. Keep record types filterable and rank
  current evidence separately; do not discard queries to reduce index size.
- Storing a source citation does not grant permission to export its derived text.
  Enforce configured source restrictions before model input and output publication.
- A process adapter may not expose tokens. Enforce measurable limits and report
  missing accounting; do not advertise a token guarantee the adapter cannot enforce.
- Real-executor acceptance depends on an available configured provider. Missing
  credentials leave that evidence pending, not the feature declared verified.

## Not doing

- No service-specific hosting, production deployment, vector database, or custom
  graph viewer in this plan. The CLI/library provides the accepted behavior.
- No copy-paste fork of either legacy parser; migrate content through one shared
  structured model so fixes apply to both sources.
- No copying the governance skill into every consumer as product implementation.
  Product capture can accept its journal as a future source without depending on it.
- No implementation journal reconstructed before coding. Start entries when
  implementation decisions actually occur after build-gate acceptance.

## Departures

None: implementation has not started. Update this section alongside code when
an accepted implementation step changes, linking the contemporaneous journal entry.
