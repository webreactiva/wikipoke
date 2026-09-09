# Operations

## Event example

```json
{
  "id": "retry-policy-2026-09-09",
  "task": "payment retries",
  "actor": "agent/claude-code",
  "at": "2026-09-09T10:00:00Z",
  "kind": "decision",
  "choice": "Retry transient gateway failures three times",
  "rationale": "The gateway documents transient timeout responses.",
  "alternatives": ["Retry indefinitely"],
  "evidence": ["src/payments/gateway.ts:42"]
}
```

`evidence` here is what the actor declared; the decision page renders it as
declared and unverified, unlike a page source, which is checked against the Git
inventory. Re-capturing the same `id` with identical content is a no-op;
re-capturing it with different content is rejected.

Task closure is a separate event. `recorded` means a record was submitted;
`none_declared` means the agent explicitly found no relevant decision and must
include its explanation; `incomplete` represents missing or failed capture.
The health report never treats a successful hook or empty event list as proof
of complete decision capture.

## Historical releases

Commit the wiki first, then use `wikipoke snapshot <label>`. The command retains
Git refs for the selected code commit and current wiki commit and writes a
manifest under `.wikipoke/releases/`. Commit that manifest in the next commit.

Nothing reads a snapshot back: there is no command to list, open, or query one.
Record the code commit the manifest names, and ask historical questions with
`wikipoke ask "..." --ref <commit>`. A release label is not accepted anywhere
except by `snapshot` itself, and a label can only be captured once.

Historical external sources remain subject to their own retention/access rules.

## Changes nobody explained

A decision event's `evidence` names the source files the choice was about. Once
`seal` has recorded a checkpoint, Wikipoke compares the source that moved since
that commit against the evidence of every decision event, and reports what is
left as changed with no reason on record — in `status`, in the attention signal,
and in the session briefing.

The comparison stays silent until a checkpoint exists. Capture explains work done
with the wiki in place; code that predates it cannot be explained after the fact,
and a backdated event tape is bookkeeping, not knowledge.
