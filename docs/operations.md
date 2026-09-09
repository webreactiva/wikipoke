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

## Nothing asks for a decision

Wikipoke records a choice when an agent has one and never asks for one it does
not. It used to: a hook on every file edit kept a journal of what was touched, a
hook on every turn end read that journal back and refused to let the agent stop
while anything in it was unexplained, and the attention signal carried the running
total. It was correct and it was paid for on every execution by every project,
whether or not that project wanted it.

That machinery is gone. `capture` is unchanged: a decision event still pins its
`evidence` into the page's `sources`, still joins the graph next to the code it is
about, and still drifts when that code moves. What no longer happens is anybody
being made to write one.

A project that does want to be asked builds it: its harness's own edit and stop
hooks, and Wikipoke's `capture.after` event to know when a decision landed. See
[extensions](./extensions.md).

## Growth, and what maintenance does about it

The event tape only ever grows, so `maintain --once` — which already runs after
every commit — keeps it in check and reports what it did as `pruned`.

Events are knowledge and are never deleted. The events of a task that is closed
are folded into `.wikipoke/events/archive/<year-month>.jsonl`, one file per
month; a task still in flight is left alone. Ten thousand events then cost a
handful of reads instead of ten thousand, with nothing thrown away. `events` and
every command built on it read the folded months and the loose files together.

The refresh itself is detached from the commit: it reads every source in scope,
which on a large repository is most of a second, and nothing waits on the result.
The commit returns immediately and the signal is rewritten a moment later.

## Reading a release back

```sh
wikipoke releases
wikipoke release v1.0.0
```

A manifest is stored under the hash of its label, so `releases` is the only way
to get from a label to what was captured. `release <label>` adds whether the code
and wiki refs are still reachable — a history rewrite can leave a manifest
describing something that can no longer be checked out.
