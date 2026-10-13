---
title: The wiki ships its own viewer
type: decision
responsibility: Why the wiki is shown in wikipoke's own HTML viewer rather than a third-party one like Obsidian, and what that choice leaves open.
sources:
  - src/atlas/web/index.html
  - src/atlas/web/atlas.js
  - src/atlas/web/graph.js
synced: d34957f
decided_by: person
reversible: true
related:
  - ../components/atlas.md
  - ../decisions/cli-read-only.md
---

The wiki is shown in the HTML viewer wikipoke builds itself, [the atlas](../components/atlas.md):
one page, rendered in the browser from a snapshot, served live or exported. Decided by Daniel:
wikipoke ships the viewer so that how the wiki looks is in its hands, and depends on no
third-party viewer.

## What was set aside, and why

A third-party viewer — Obsidian named as an instance, not the whole of it — would have been a
ready-made way to look at a folder of Markdown. It was set aside for the one reason Daniel gave:
a viewer taken off the shelf does not let wikipoke control how its wiki looks. What that control
buys is visible in the code: the layout is wikipoke's shell, not a generic viewer's
(`src/atlas/web/index.html:13`), and rendering happens on wikipoke's terms.

## What it constrains

- The viewer is source code wikipoke owns: the page shell (`src/atlas/web/index.html:2`), the
  renderer (`src/atlas/web/atlas.js:2`) and the graph (`src/atlas/web/graph.js:2`), all plain
  files that land in every serve and export.
- The renderer is a classic script, not a module, so the same page opens from disk
  (`src/atlas/web/atlas.js:11`).
- The graph is hand-written, no library (`src/atlas/web/graph.js:5`); [marked](https://marked.js.org)
  is the one rendering library loaded (`src/atlas/web/index.html:29`).
- The viewer widens the CLI's rule the way [read-only CLI](../decisions/cli-read-only.md)
  records: it reads the wiki and writes only outside it.

## What it does not close

Setting the viewer in-house is not setting the files in-house. The wiki stays plain Markdown, an
Open Knowledge Format bundle whose frontmatter any strict reader takes
([CONVENTIONS.md](../CONVENTIONS.md)), so a person may still open it in Obsidian or anywhere
else. Obsidian even served as the model the graph imitates — imitation, not dependency
(`src/atlas/web/graph.js:2`).