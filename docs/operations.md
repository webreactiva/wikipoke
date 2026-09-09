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

## What an agent touched, before any commit

That comparison needs a commit and a sealed checkpoint, which is too late to ask
anyone why. The journal answers the same question earlier and from observation
rather than declaration:

```sh
wikipoke journal --session ses_01H...
```

It reports the in-scope files a session edited, and which of them no decision
claims. Entries come from the `tool-journal` hook, which appends one unfiltered
line per edit; `include`, `exclude` and the wiki path are applied when the
journal is read, so a hook that runs on every keystroke of an agent's work never
parses a configuration file.

Omit `--session` for every session on record. `capture` in
`wikipoke.config.yaml` — `off`, `remind` or `block` — decides what
`session-stop` does with the answer.

## Growth, and what maintenance does about it

Both durable inputs only ever grow, so `maintain --once` — which already runs
after every commit — keeps them in check and reports what it did as `pruned`.

A session's journal is observation, not knowledge: once every in-scope file it
recorded is explained by a decision or by a closure declaring none, it has done
its job and is removed. The tape of decisions survives it.

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
