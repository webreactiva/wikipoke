# Extensions

Wikipoke does the deterministic work — plan a batch, validate a patch, publish it, refresh the
attention signal, seal a checkpoint. What a particular project wants to happen *around* that is not
the tool's to guess, and every time it guessed it grew a setting, a hook and a flag that most
projects paid for and never used.

An extension is a script this project declares in `wikipoke.config.yaml`, attached to one point in
Wikipoke's own lifecycle. Wikipoke runs it, hands it the event, and gets out of the way.

## Declaring one

```yaml
version: 1
wiki: wiki
include:
  - src/**
extensions:
  - event: publish.after
    run: ./scripts/notify-the-team.sh
  - event: seal.before
    run: ./scripts/require-a-review.sh
    blocking: true
    timeout: 30
limits:
  batchFiles: 10
  batchBytes: 65536
```

| Field | Meaning |
| --- | --- |
| `event` | Which lifecycle point fires it. Required. |
| `run` | A shell command, run from the project root. Required. |
| `timeout` | Seconds before the script is cut off. Defaults to `10`, maximum `600`. |
| `blocking` | Whether a non-zero exit refuses the action. Defaults to `false`, and is only accepted on a `.before` event. |

Extensions are **declared, not discovered**. There is no directory whose contents run: a directory
like that is a directory anything can be dropped into, and `wikipoke doctor` could never say which
of those files was meant to be there. `doctor` lists exactly what is attached, and names any entry it
cannot read.

## Events

| Event | Fires | Payload beyond `event`, `at` and `root` |
| --- | --- | --- |
| `init.after` | A project has been initialized | `wiki`, `language`, `config` |
| `ingest.before` | Before a batch is planned | `ref` |
| `ingest.after` | A plan was produced | `revision`, `complete`, `remaining`, `sources` |
| `publish.before` | Before a patch is validated or written | `ref`, `pages` |
| `publish.after` | Pages were written | `ref`, `published`, `findings` |
| `ask.after` | A query was opened or reused | `requestId`, `question`, `ref`, `state`, `reused`, `path` |
| `answer.after` | An answer was persisted | `requestId`, `state`, `citations`, `gaps`, `pages` |
| `capture.after` | A task event was recorded | `id`, `task`, `kind`, `actor`, `evidence`, `materialized`, `decisions` |
| `snapshot.after` | A release was captured | `label`, `code`, `wiki`, `at` |
| `seal.before` | Before the checkpoint advances | `ref` |
| `seal.after` | The checkpoint advanced | `lastIndexedCommit`, `sealedAt` |
| `maintain.after` | The attention signal was refreshed | the whole signal, which is already bounded and sampled |

The payload is a **summary of the command, never its output**. An `ingest` plan carries the full text
of every source in the batch; piping that into every extension on every pass is the kind of cost that
gets a feature uninstalled, so `ingest.after` names the source ids and stops there. If a script needs
more, it can ask for it — see below.

## The contract

- The payload arrives on **stdin** as one JSON object. `WIKIPOKE_EVENT` and `WIKIPOKE_ROOT` are also
  in the environment, so a one-line script that only needs to know where it was called from does not
  have to parse JSON to find out.
- The working directory is the project root.
- **Exit `0` for success.** Anything else — including a timeout — is a failure.
- A failing **observer** never fails the command it was watching. It is reported on stderr, so the
  command's own JSON on stdout stays parseable, and so an extension that quietly stopped working is
  not an extension nobody notices is gone.
- A failing **blocking** extension refuses the action. It runs before anything is written, so the
  wiki is left exactly as it was, and Wikipoke exits non-zero naming the script that refused.
- Extensions attached to the same event run in **declaration order**.

## Extensions run outside the writer lock

A script is called on either side of the command, never inside it, so it can run Wikipoke commands of
its own — `wikipoke status`, `wikipoke lint`, `wikipoke capture`. An extension called with the lock
held would be handed a lifecycle event and a tool that answers `Wiki writer locked`: an instruction it
cannot carry out. That trap is the reason this surface exists rather than more built-in behaviour.

One consequence worth stating: a `blocking` extension holds up the command for as long as it runs,
bounded by its `timeout`. Attach slow work to an `.after` event and let it detach itself.

## What this replaces

Automatic decision capture used to be built in: a hook on every file edit wrote a journal, a hook on
every turn end read it back and refused to let the agent stop, and the attention signal carried the
running total. It was a correct idea paid for on every single execution by every project, whether or
not that project wanted it.

It is now something a project attaches. The pieces Wikipoke keeps are the ones that are pure gain when
unused: `wikipoke capture` still records a decision when an agent has one, decision pages still join
the graph next to the code they are about, and `log.md` is still generated from the tape. What is gone
is the machinery that made all of that happen whether anyone asked for it or not.

A project that wants the old behaviour back builds it on the harness's own hooks — Claude Code's
`PostToolUse` and `Stop`, an OpenCode plugin — and on `capture.after` here, which is where Wikipoke can
tell it that a decision landed.
