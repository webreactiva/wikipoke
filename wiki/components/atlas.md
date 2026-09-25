---
title: The atlas
type: entity
responsibility: How `wikipoke atlas` turns the wiki into one snapshot that a browser page renders, served live or exported as a static site, without ever writing in the wiki.
sources:
  - src/atlas/snapshot.ts
  - src/atlas/serve.ts
  - src/atlas/export.ts
  - src/atlas/web/atlas.js
  - src/atlas/web/graph.js
  - src/atlas/web/index.html
  - src/atlas/web/tsconfig.json
  - scripts/build.ts
synced: 542edcd
related:
  - ../architecture.md
  - ./cli.md
  - ../decisions/cli-read-only.md
  - ../concepts/file-ownership.md
---

The atlas is the wiki put in a browser, for people. Besides the installer, it is the one part of
the CLI that is not a check, and it measures nothing new: it shows what the pages and `drift`
already say. It arrived in
`12ff4b8`, and with it the project's rule for CLI code widened from "a deterministic, read-only
check" to "that, or atlas" — on the condition that it reads the wiki and writes only outside it.
[The decision page](../decisions/cli-read-only.md) records that change.

```
            src/bin/wikipoke.ts  (atlas branch)
                 │                       │
        --out <dir>                  no --out
                 ▼                       ▼
     export.ts exportSite()      serve.ts serve()  127.0.0.1:4747
      │ writeAssets(dir)          │ GET /wiki.js · /wiki.json  ← snapshot() on every request
      │ wiki.js  (live: false)    │ GET /code/<tracked file>
      ▼                           │ GET /events  ← fs.watch(wiki/) → "change"
   a folder to publish            ▼
                 └──────► web/index.html + atlas.js + graph.js + marked.js
                          reads window.ATLAS, renders everything in the browser
```

## One snapshot, two ways to deliver it

Everything the page shows is gathered by `snapshot()` into a single object: every page with its
frontmatter and body, its citations, its backlinks, and whether `drift` finds it stale
(`src/atlas/snapshot.ts:72`). The browser side does all the rendering, so the live server and the
export hand it exactly the same thing and differ only in the `live` flag.

The snapshot borrows its judgements rather than making its own. Staleness is `drift.run()`
(`src/atlas/snapshot.ts:75`), and backlinks come from the same `markdownLinks` / `relatedLinks`
reading that lint checks, so atlas and `check` never disagree about which page points where
(`src/atlas/snapshot.ts:84`). The browser does the same with citations: inline code becomes a link
only when it is in the snapshot's citation list, never by a regex of its own
(`src/atlas/web/atlas.js:172`).

It is delivered as a script, `window.ATLAS = …`, not as JSON (`src/atlas/export.ts:47`): a page
opened from disk may load scripts but may not fetch. For the same reason `atlas.js` is a classic
script wrapped in a function, not a module, because a module does not load from `file://`
(`src/atlas/web/atlas.js:11`). Routes live in the URL hash for the same page to work served,
published or opened from disk.

## Live: served on this machine, and only to it

`wikipoke atlas` serves the page on `127.0.0.1`, rebuilding the snapshot on every request the way
`check` recomputes on every run — there is no cache to invalidate (`src/atlas/serve.ts:102`). A
taken port moves it to the next one, up to twenty tries; a port asked for with `--port` fails
instead of moving (`src/atlas/serve.ts:44`).

The server holds the repository's source, so it is guarded three ways. A request whose `Host` is
not `127.0.0.1`, `localhost` or `[::1]` is refused, which stops a site that rebinds its own name to
the loopback address from reading the code (`src/atlas/serve.ts:31`). Anything but `GET` and
`HEAD` gets a 405 (`src/atlas/serve.ts:91`). A cited file under `/code/` is served only when git
tracks that exact path, which keeps `..` and untracked secrets out (`src/atlas/serve.ts:113`).

It watches the wiki directory, not the code (`src/atlas/serve.ts:59`). A change is debounced for
150 ms and pushed to every open page as a server-sent event; the page refetches `wiki.json` and
redraws where it was (`src/atlas/web/atlas.js:548`), so an ingest pass can be watched landing page
by page. An edit to the code shows up only as a stale page on the next redraw, because nothing
watches the code.

## Exported: a folder, and where citations point

`--out <dir>` writes the page, marked and the snapshot into a directory (`src/atlas/export.ts:57`).
A citation there cannot open atlas's own file view, so it points at the remote instead, at the
page's own `synced:` commit — the code the page was last checked against, not today's
(`src/atlas/web/atlas.js:97`). A page with no `synced:` falls back to the commit exported.

The remote URL is rebuilt from its host and path alone, so a token embedded in an `https` remote
never reaches a page that may be published (`src/atlas/snapshot.ts:153`). GitHub and GitLab get
links. Any other host gets no links rather than wrong ones.

The export refuses two targets. A directory inside the wiki is refused, because atlas never writes
there (`src/atlas/export.ts:60`). A directory that already holds files is refused unless its
`index.html` carries the `managed by wikipoke` line (`src/atlas/export.ts:65`,
`src/atlas/web/index.html:2`), which is how a previous export is told apart from someone's own
site — the same marker [every managed file](../concepts/file-ownership.md) carries.

The inside-the-wiki test compares paths as strings. On a case-insensitive filesystem, such as
macOS by default, `--out Wiki/site` resolves inside `wiki/` and passes it, and so would a symlink
into the wiki. This is read from the code, not tried.

## marked, and the one dependency that is not one

The page renders Markdown with [marked](https://marked.js.org), which is a devDependency and never a
copy kept in the repository (`src/atlas/export.ts:16`). Run from the sources, it is read from
`node_modules`. The build copies it next to the compiled code along with the page
(`scripts/build.ts:11`), so the published package still has no runtime dependency and atlas works
offline. This is the "anything else the shipped tree needs has to be added by hand" cost that
[TypeScript read two ways](../decisions/typescript-two-ways.md) predicted.

The browser files are plain JavaScript the browser runs as they are, but not unchecked: their own
`tsconfig.json` type-checks them with `checkJs`, against the snapshot's types imported from
`snapshot.ts` (`src/atlas/web/tsconfig.json:11`). `npm run typecheck` runs it; the build never
copies it.

## The graph

`graph.js` draws pages as nodes and page-to-page links as edges with a force simulation written by
hand, no library: the wiki already warns past 80 pages, and a few dozen nodes need nothing a
hundred lines of springs and repulsion cannot do (`src/atlas/web/graph.js:5`). `index.md`, `log.md`
and `CONVENTIONS.md` stay out of it, or the index would be a hub tied to everything
(`src/atlas/web/atlas.js:308`).
