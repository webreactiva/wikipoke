# Spec: Wikipoke maintained knowledge

Status: accepted by Daniel on 2026-09-08 (design gate).
Date: 2026-09-08. Owner: Daniel.
Context: [proposal](../../PROPUESTA.md). Cycle: [state](./state.md).

## Problem

Daniel has two separate LLM-maintained wikis: Widgetron documents software and
tracks source drift; Web Reactiva synthesizes concepts from multiple sources
and presents their connections. Reusing their best behavior currently means
copying project-specific tooling. Software changes, implementation choices,
and useful queries also need a durable, connected record that can be checked
and consulted later. Wikipoke should make this knowledge maintainable across
projects, beginning with software repositories and allowing broader sources.

## Source ledger

This ledger is reconstructed from the project conversation on 2026-09-08.
English descriptions below preserve meaning rather than quote the Spanish text.

| ID | Source and decision | Attribution |
| --- | --- | --- |
| U1 | Unify the two wikis in a reusable library based on LLM Wiki and OKF; support relationships, bootstrap, updates, freshness checks, and questions; begin with code but allow broader use. | Daniel supplied |
| U2 | Preserve queries as wiki content and capture agent implementation decisions through manual or automatic hooks/skills. | Daniel supplied |
| U3 | Include intention/decision/behavior separation, source-conflict handling, and detection of incomplete decision capture. | Daniel explicitly selected the recommendations |
| U4 | Use releases or Git-backed historical capture rather than implementing a complex history system now. | Daniel supplied |
| U5 | Corrections can be made through an AI agent editing the generated wiki. | Daniel supplied |
| U6 | Continue with the proposed Standard cycle, versioned artifacts, no tracker, and human gates; initialize Git and commit setup; Spanish conversation, English documentation. | Setup accepted as a block; language and Git actions supplied |
| U7 | Activate maintenance automatically once its required execution configuration is complete. | Daniel supplied after design acceptance, resolving O-001 |
| P1 | Proposal sections 4-8 and 10 contain suggested lifecycle details, integration policies, architecture, and delivery sequencing. | Agent proposals; not individually approved |
| E1 | Widgetron conventions and health/query tooling; Web Reactiva card parser and graph validator, linked from proposal section 2. | Local implementation precedent |

`⚠` marks a requirement originally proposed by the agent beyond the explicit
user decisions. Daniel accepted this specification as a whole on 2026-09-08;
the marks retain provenance rather than indicating an unaccepted requirement.
The proposal remains context; this specification defines reviewable behavior.

## Behavior

**FR-001 — Portable connected knowledge.** The system MUST maintain a wiki
readable as an OKF-compatible bundle and support the LLM Wiki ingestion, query,
and review workflow. It MUST integrate with projects independently of their
implementation language and allow source kinds beyond code without redefining
the meaning of existing knowledge. (U1)

**FR-002 — Autonomous lifecycle.** After its required executor and execution
environment are configured, the system MUST bootstrap an absent wiki, discover
source changes, and reconcile affected knowledge without a fresh user prompt
for each pass. It MUST expose incomplete work and missing execution capabilities
instead of declaring success. Completing the executor, scope, limits, and
execution-environment configuration MUST activate unattended maintenance without
a separate activation step. (U1, U7)

**FR-003 — Evidence and health.** The system MUST link knowledge to the sources
and revisions supporting it and report integrity, drift, and uncovered source
scope separately. Review MUST distinguish structural validity from semantic
verification, and observed facts from inferred explanations. A changed source
MUST trigger assessment rather than automatically label every related claim
false. (U1, U3; E1: proposal section 2)

**FR-004 — Relationships and impact.** The system MUST expose relationships for
navigation, retrieval, and impact review, with explicit meaning and direction
where relevant. It MUST distinguish navigation, dependencies, and provenance,
derive incoming links without requiring duplicate declarations, and reconstruct
the graph from the wiki. Renaming a unit MUST preserve its traceable identity.
⚠ (U1; P1: graph behavior and rename guarantees)

**FR-005 — Grounded answers.** Answers MUST identify supporting evidence and
consulted revisions, disclose relevant gaps or unavailable sources, and expose
unresolved conflicts affecting their conclusions. Lack of wiki coverage MUST
NOT be presented as proof that a software capability does not exist.
(U1, U3; E1: Widgetron query behavior)

**FR-006 — Query preservation.** Every query submitted to Wikipoke MUST become
wiki content, including its original question and any delivered answer, evidence,
scope, and completion outcome. Failure to generate an answer MUST NOT erase the
question. Separate invocations MUST remain distinguishable; replaying the same
captured request MUST NOT duplicate it. Historical responses MUST remain
identifiable as the responses delivered at their recorded revision. (U2)

**FR-007 — Implementation choices.** The system MUST capture agent-declared
choices during software implementation through manual and automatic entry
points. It MUST preserve task context, attribution, declared reasons, and
available implementation evidence. Choices with independent relevance MUST be
representable as decisions linked to implementation records and affected
knowledge. Missing reasons MUST remain unknown rather than being invented
from code changes. (U2)

**FR-008 — Intent versus reality.** The system MUST distinguish intended
outcomes, selected decisions, and behavior evidenced at a software revision.
Implementation status MUST NOT imply human approval. If later software no
longer conforms to a decision, the system MUST expose the divergence without
silently revoking the decision or rewriting its historical rationale. (U3)

**FR-009 — Conflict resolution.** Conflicting claims about the same scope MUST
retain competing evidence and a traceable resolution history. Source authority
MUST depend on the kind of claim rather than a universal newest-source or
code-wins rule. Agents MAY resolve evidenced documentation errors; changes
requiring a project requirements/decision choice MUST remain pending for an
authorized owner. Unrelated maintenance MAY continue. ⚠
(U3; P1: boundary of autonomous conflict resolution)

**FR-010 — Capture completeness.** For observed implementation tasks, the system
MUST distinguish a submitted decision record, an explicit declaration of no
relevant decisions, and incomplete capture. A successful hook or empty log MUST
NOT establish completeness. Reports MUST expose missing closure and pending
materialization, and MUST NOT certify unobserved agent sessions. (U3)

**FR-011 — Release history.** The system MUST support manual or release-triggered
historical capture using Git as backing, identifying recoverable code/wiki
versions and their recorded health. Historical queries MUST use the selected
snapshot without modifying it or silently substituting current sources.
Unavailable historical external evidence MUST be disclosed. (U4)

**FR-012 — Agent corrections.** Generated knowledge MUST remain editable through
a project AI agent, with ordinary validation and change recording. The initial
product MUST NOT require a separate human-correction subsystem. (U5)

**FR-013 — Reusable integration.** A project MUST be able to install the system's
maintenance and query entry points, including the required hooks/skills, and
identify which capabilities are active. Unattended execution MUST work outside
interactive sessions when its executor and scheduling environment are present.
(U1, U2)

**FR-014 — Existing-wiki continuity.** The system MUST account for the code-source
tracking and multi-source concept relationships present in the two existing
wikis. Existing content and evidence MUST remain available when adopting the
shared system; migration MUST expose any material it cannot preserve.
(U1; E1: both implementations)

**FR-015 — Operational boundaries.** Maintenance MUST respect configured source
and write scope, preserve concurrent edits, survive interrupted work without
false checkpoint advancement, and avoid duplicate processing or self-triggered
loops. Budgets and missing providers MUST leave visible pending work. Installation
MUST preserve prior project integrations; removal MUST preserve knowledge.
Queries and derived outputs MUST respect configured source restrictions.
⚠ (P1: operational and installation safeguards)

## Scenarios

| ID | Given / When / Then | Requirements |
| --- | --- | --- |
| S1 | No wiki, configured execution: bootstrap creates initial knowledge and exposes remaining scope until processed. | FR-001, FR-002 |
| S2 | Source changes: affected knowledge is reviewed; unchanged meaning can remain; changed evidence alone is not a falsehood verdict. | FR-003, FR-004 |
| S3 | Sources stop changing but initial coverage is incomplete: checks still expose the backlog. | FR-002, FR-003 |
| S4 | A query reaches the system and the model fails: its question and failure outcome remain queryable in the wiki. | FR-006 |
| S5 | A user repeats a question after a software change: both invocations and their evidence remain distinguishable; a technical retry does not create a third invocation. | FR-005, FR-006 |
| S6 | An agent chooses retries and records why: its implementation log links the decision and affected component; absent rationale stays unknown. | FR-007 |
| S7 | A queue is decided but processing is synchronous: the answer distinguishes intention from evidenced behavior. Later divergence from an implemented decision opens a finding. | FR-008 |
| S8 | A requirement and implementation disagree at the same revision: both remain visible; the agent does not silently change the requirement to resolve the conflict. | FR-009 |
| S9 | A hook exits successfully without a record or explicit absence declaration: capture remains incomplete. An unobserved session is not reported as complete. | FR-010 |
| S10 | A release snapshot exists: a historical query cites its code/wiki versions, records its own result in active knowledge, and leaves the snapshot untouched. | FR-006, FR-011 |
| S11 | A person asks an agent to correct a page: ordinary editing and validation suffice, with the change recorded. | FR-012 |
| S12 | A maintainer and user edit the same page concurrently: the user's content is not silently overwritten. A crash during another batch does not advance its checkpoint falsely. | FR-015 |
| S13 | A unit is renamed: relationships and historical identity remain traceable after graph reconstruction. | FR-004 |
| S14 | Existing wiki input cannot be parsed completely: adoption reports the missing material and preserves originals rather than silently dropping evidence. | FR-014 |
| S15 | A project already has hooks: install twice and remove Wikipoke; prior hooks and generated knowledge remain, with no duplicated managed integration. | FR-013, FR-015 |
| S16 | A provider or budget becomes unavailable: generation stays visibly pending and mechanical health checks remain usable. | FR-002, FR-015 |

## Out of scope

- Implementing a specialized temporal query engine or automatic cross-version
  comparison now. Git-backed release capture covers the agreed initial need. (U4)
- A separate human-correction product workflow. Existing agents edit the wiki. (U5)
- Claiming complete knowledge of decisions in unobserved sessions, or recovering
  undeclared author motives as facts. (U2, U3)
- Treating a graph or semantic review as proof of absolute truth. (U3)
- Production deployment in this cycle before its release gate and an explicit
  deployment instruction. No remote tracker or repository is configured. (U6)

Additional remote connectors, vector search, a hosted multiuser service, and a
dedicated graph viewer remain later-delivery proposals, not required choices
for this design gate. Their absence must not prevent the behaviors above. (P1)

## Standing assumptions

- ⚠ FR-004: typed relations, derived backlinks, rebuildability, and rename
  continuity are the agent's proposed interpretation of useful graph support.
- ⚠ FR-009: agents resolve evidenced documentation errors autonomously, but
  leave requirement/decision changes to an authorized project owner.
- ⚠ FR-015: the listed operational boundaries are proposed acceptance obligations,
  not separately selected user policies or numeric limits.

## Open concerns

| ID | Concern | Owner | Impact and current handling |
| --- | --- | --- | --- |
| O-002 | Which executor and agent integration should be supported first? | Daniel, with agent feasibility assessment | Blocks concrete integration planning for FR-007/FR-013, not the behavioral specification. The proposal's generic adapter is not a promise that every agent exposes every hook. |
| O-003 | What source restrictions and numeric budgets apply to a particular installation? | Installing project owner | Needed when configuring an installation under FR-015. The library must expose configuration; this specification does not invent token limits or declare all source content public. |

## Resolved concerns

- O-001: Daniel selected automatic activation after design acceptance on
  2026-09-08. FR-002 now records the default. Required configuration and checks
  still apply; there is no additional activation gate for product maintenance.

## Policy and coverage

Follow [AGENTS.md](../../../AGENTS.md): Spanish conversation, English documents,
and honest gate attribution. The accepted Standard setup folds intent into this
specification. Architecture and suggested commands remain in the proposal;
file-level implementation and verification steps belong in the later plan.

Coverage read: problem and behavior are covered by user requests and precedents;
scenarios make their edge cases observable; non-goals reflect explicit exclusions
or labeled proposals. Three provenance-marked assumptions, two open concerns,
and one resolved concern are visible above.
This specification contains 15 requirements, three retaining assumption
provenance. Daniel accepted the design; the listed open concerns remain explicit
and must be settled where they block planning. Implementation still requires
acceptance of the implementation plan at the human build gate.
