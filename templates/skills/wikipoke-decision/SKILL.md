---
name: wikipoke-decision
description: "Write a decision a person took into the wiki as a decision page: the person says what was chosen, what was set aside and why, and the agent finds what it constrains and relates to, checks it against the code, shows the draft and writes it only after a yes. Use when: (1) the user invokes /wikipoke-decision, (2) the user asks to record, write down or keep a decision they or their team took: 'record this decision', 'write down that we decided…', 'we decided X, put it in the wiki', 'anota esta decisión'. Not for decisions an agent makes while implementing (that is wikipoke-implement or the decisions hook), nor for questions about past decisions (that is wikipoke-query)."
argument-hint: "<the decision, in your own words>"
---
<!-- managed by wikipoke: `wikipoke init` rewrites this file. Project rules go in {{WIKI}}/CONVENTIONS.md. -->

# wikipoke-decision: a person's decision, written down

Many decisions are taken by people: in a meeting, in a review, by whoever knows the product. The
code keeps the choice and none of the reasons, and a newcomer never finds them. Here the person
gives the reason, which is the half of a decision page no code and no `git log` holds, and you do
the rest: the template, the files it constrains, the pages it relates to, the check against the
code. One page per call, written only after a yes.

```
the person's words ──► chosen · discarded · why?  ──► missing ──► ask, one question at a time
                                │ all three
                                ▼
                 read the wiki: a decision page on it?   ──► new · extend · supersede
                 read the code: does it say so?           ──► yes · not yet (planned) · otherwise (the person decides)
                                ▼
                 show the draft ──► yes ──► write the page, the links, index.md, log.md ──► wikipoke check
```

**The person is the source, and the person is there.** Everything about why comes from them; you
neither invent a reason nor go looking for one in the history. What you find in the code and the
wiki is what you check their words against.

## 1. Read the schema

Read `{{WIKI}}/CONVENTIONS.md`: the page template, the rules for `sources:`, "Writing a page" and
"Decisions worth recording", which says what a note and a decision page hold. Follow it so
`wikipoke check` passes. If `{{WIKI}}/` has no `index.md` yet, the wiki was never seeded: say so
and offer `/wikipoke-ingest` first, so the page has something to link to.

## 2. Is there enough to write?

A decision page needs three things: **what was chosen**, **what was set aside**, and **why**.
Take them from the person's words. When one is missing, ask for it, one short question at a time,
in the person's language: no questions about format, slugs or links, which are yours to decide.
The one other question worth asking comes from the code, in §4.

- **No alternative after asking**: there is probably no decision, only a fact or a rule. Say so
  in one sentence and stop; a rule belongs in the project's agent instructions (`AGENTS.md`), and
  `/wikipoke-agents` is the way to put it there.
- **Small and already evident in the code** (a name, a format a linter enforces): say that the
  section "Decisions worth recording" leaves such choices out, and ask whether to record it
  anyway. The person decides; that section is the bar for what agents note on their own, not for
  what a person asks to keep.

## 3. Read the wiki

Read `{{WIKI}}/index.md`, then every `decision` page whose title or `responsibility` touches the
same subject, and the `entity`, `flow` and `concept` pages the decision affects.

- **No decision page on it**: a new `decisions/<slug>.md`.
- **One already, and the new words fit it** (a reason it lacked, an alternative it did not name):
  extend that page instead. Two pages on one decision soon disagree.
- **One already, and the new decision reverses it**: a new page, and the old one is superseded.
  The old page keeps its body, which is the history, and opens with one line linking to the new
  page and saying when and by whom it was reversed. The new page links back and says what it
  replaces. The old page gains `status: deprecated` only when the code stops doing what it says:
  at once if the code already follows the new decision; if the new one is planned (§4), the old
  page stays in force, its line says a planned decision will reverse it, and the ingest that
  drops `planned:` from the new page marks the old one `status: deprecated`.

## 4. Read the code

Find the files the decision constrains: the ones a person changing this would have to open.
Search, then **open every file you will list**: `sources:` holds only files you read. Then
compare what the code does with what the person said.

- **The code does it**: write it as it is.
- **The code does not do it yet** ("we will move to Postgres"): the decision is planned. Write it
  with `planned: true` in the frontmatter. Its `sources:` are the files that exist today and
  that the change will touch, never a file that does not exist yet (`wikipoke check` reports that
  as a dead source); name the files still to be written in the body. Look for where the change
  will land, not only where the feature shows: a comment that names this choice, or the way out
  of it, marks the file to cite, and the choice the decision reverses. When the code that carries
  it out is committed, those sources change, the page goes stale, and the next
  `/wikipoke-ingest` reads the diff and drops `planned:`.
- **The code says otherwise** (the decision says "no runtime dependencies", the manifest has
  three): say so plainly, with the file and line, and let the person choose. Either the decision
  stands and the code has yet to follow it, which is a planned decision as above, with the
  current state of the code in the body; or the code is right and the decision is not what they
  remembered, and you write what they now confirm, or nothing. This skill never changes the
  code: if they want it fixed first, that is ordinary work, and the page can wait for it.
- **The decision leaves a gap the code makes plain** (it changes a behaviour other parts rely
  on, and the person's words do not say what happens to them): ask that one question, with the
  options you see and the one you recommend, and write the answer into the page. A gap you fill
  on your own is a decision nobody took.
- **There is no code to cite** (a policy, a process, a rule about reviews): `sources:` names the
  file that states or enforces it, `AGENTS.md`, a CI workflow, `CONTRIBUTING.md`. If no file in
  the repository says it, the rule has no home yet: tell the person, offer `/wikipoke-agents` to
  write it into `AGENTS.md`, and write the page, which keeps the why, once that file exists. A
  decision page always has `sources:`; without them drift cannot tell when it stops being true.

If a file you will list has uncommitted changes, ask the person to commit first: `synced:` has to
name a commit that holds the code the page describes.

## 5. Show the draft

Show the person, in one message:

- the page as it will be written, frontmatter included: `type: decision`, `decided_by: person`,
  `synced:` from `git rev-parse --short HEAD`, `generated:` as `{ by: <you>, at: <now> }` (you
  wrote the page; `decided_by:` says who took the decision), `reversible:` `true` or `false` when it is clear
  from what the decision constrains (leave it out rather than ask), `planned: true` when §4 said
  so, `related:` the pages from §3;
- the other changes, each in one line: the pages that gain a link to it, the old page that is
  superseded, the `index.md` line, the `log.md` entry.

The body follows "Writing a page": what was decided, then **what was set aside and why**, which
is the centre, then what it constrains, pointing at code with `path:line` taken from the files you
opened. Keep the person's reason in substance and in their terms; tidy the prose, never the
argument. The reason is theirs, first hand, so `confidence:` stays `high`; mark a sentence as your
reading only if you added one.

Write nothing until the person says yes. A change they ask for goes into a new draft, shown again.

## 6. Write, check, log

On the yes: write the page and the other changes, add the page to `index.md` under `decision`,
and add a `* **wikipoke-decision**: …` entry to `log.md` naming the page and whether it is new,
extended or supersedes another, in the shape "State and log" gives. Run `wikipoke check lint`
and fix what it reports on the pages you touched.

Do not touch `.wikipoke-state.json`: the checkpoint means every commit is reflected, and one
decision page says nothing about that. Do not touch `{{WIKI}}/.inbox/` either: its notes are the
next ingest's.

**Close** with the page you wrote, what links to it, and, for a planned decision, that the next
`/wikipoke-ingest` after the code lands will mark it done. Commit nothing unless the person asks.
