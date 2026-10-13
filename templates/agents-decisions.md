<!-- wikipoke:decisions:start · managed by wikipoke: `wikipoke hooks remove decisions` takes this block out -->
## Decisions while implementing

When you write code here, note the decisions worth keeping as you make them, so the next
`wikipoke-ingest` can turn them into wiki pages. Which decisions count, and what a note holds, is
the section "Decisions worth recording" of `{{WIKI}}/CONVENTIONS.md`: read it once per session and
record only what it allows. Most changes record nothing. If the section is missing, record nothing
and tell the person to add it from wikipoke's template `CONVENTIONS.md`.

One note per decision, never several in one file: `{{WIKI}}/.inbox/YYYY-MM-DD-<slug>.md`, written
in seconds when you make the choice, without reading the wiki. The inbox is never committed: if it has no `.gitignore`,
create one holding `*`. Before you finish, read your own diff once for a choice the bar covers
that has no note yet — where something runs, what it depends on, what is hard to undo — and write
it. Then say how many notes you left.
<!-- wikipoke:decisions:end -->
