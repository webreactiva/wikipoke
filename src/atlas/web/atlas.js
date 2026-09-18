// @ts-check
// atlas: renders the snapshot wiki.js leaves in window.ATLAS. Routes live in the hash, so the same
// page works served by `wikipoke atlas`, published from a directory, or opened from disk:
//
//   #/                     index.md
//   #/flows/check          a page, or one of the wiki's own files: log, CONVENTIONS
//   #/flows/check#heading  a heading on it
//   #code/src/x.ts:42      a cited file, only when served live
//
// Plain JavaScript the browser runs as it is; `npm run typecheck` reads it with the snapshot's
// types from ../snapshot.ts. A classic script rather than a module, because a module does not load
// from disk; the wrapper keeps its names from landing on window, where `escape`, `status` and
// `find` already live.

/** @typedef {import("../snapshot.ts").Snapshot} Snapshot */
/** @typedef {import("../snapshot.ts").AtlasPage} AtlasPage */
/** @typedef {import("../snapshot.ts").AtlasDoc} AtlasDoc */
/** @typedef {import("../../lib/lib.ts").Citation} Citation */
/** @typedef {import("./graph.js").Graph} Graph */
/** @typedef {import("./graph.js").GraphNode} GraphNode */
/** @typedef {import("./graph.js").GraphLink} GraphLink */
/** @typedef {import("./graph.js").GraphView} GraphView */

(() => {
  /** @type {{ parse(markdown: string): string, parseInline(markdown: string): string, use(extension: object): void }} */
  const markdown = /** @type {any} */ (globalThis).marked;

  /** @type {Snapshot} */
  let data = /** @type {any} */ (window).ATLAS;

  /** @type {Graph} */
  const graph = /** @type {any} */ (globalThis).atlasGraph;

  /** The graphs on screen, stopped before anything else is drawn. @type {GraphView[]} */
  let views = [];

  /**
   * @template {Element} T
   * @param {string} selector
   * @param {{ new (): T, prototype: T }} type
   * @returns {T}
   */
  function find(selector, type) {
    const element = document.querySelector(selector);
    if (!(element instanceof type)) throw new Error(`atlas: the page has no ${selector}`);
    return element;
  }

  const main = find("main", HTMLElement);
  const aside = find("body > aside", HTMLElement);
  const pages = find("nav details", HTMLDetailsElement);
  const list = find("nav details > div", HTMLDivElement);
  const filter = find("nav input", HTMLInputElement);
  const narrow = matchMedia("(max-width: 44rem)");

  /** @param {string} text */
  const escape = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  /** @param {string} text */
  const fold = (text) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

  /**
   * A frontmatter line, which may carry `code` or *emphasis* like the body does.
   * @param {string} text
   */
  const inline = (text) => markdown.parseInline(text);

  /** @param {string[]} items */
  const bullets = (items) => `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;

  // Raw HTML in a page is shown as text, never run: agents write these pages, and an export may be
  // published. Comments, like the template's `<!-- body -->` hint, are dropped.
  markdown.use({
    renderer: {
      /** @param {{ text: string }} token */
      html({ text }) {
        return text.trim().startsWith("<!--") ? "" : escape(text);
      },
    },
  });

  /** @param {string} id */
  const pageById = (id) => data.pages.find((page) => page.id === id);

  /** @param {string} id */
  const docById = (id) => data.docs.find((doc) => doc.id === id);

  // ── Where things point ──────────────────────────────────────────────────────────────────────────

  /**
   * A cited file: atlas's own view when live, the remote at the page's `synced:` commit when
   * exported (the code the page was last checked against), nothing when there is no remote.
   * @param {string} path
   * @param {number} line
   * @param {string} sha
   */
  function codeHref(path, line, sha) {
    if (data.live) return `#code/${path}${line ? `:${line}` : ""}`;
    if (data.blob) return `${data.blob}${sha || data.commit}/${path}${line ? `#L${line}` : ""}`;
    return "";
  }

  /**
   * @param {string} path
   * @param {number} line
   * @param {string} sha
   */
  function codeLink(path, line, sha) {
    const label = `<code>${escape(path)}${line ? `:${line}` : ""}</code>`;
    const href = codeHref(path, line, sha);
    if (!href) return label;
    return `<a href="${escape(href)}"${data.live ? "" : ' target="_blank" rel="noopener"'}>${label}</a>`;
  }

  /** @param {string} id */
  function pageLink(id) {
    const page = pageById(id);
    return `<a href="#/${escape(id)}" title="${escape(page?.responsibility ?? "")}">${escape(page?.title ?? id)}</a>`;
  }

  /**
   * Where a link written in a wiki file goes: another page, a heading, a file in the repository, or
   * out. `from` is the file's path inside the wiki; links resolve the way lint resolves them.
   * @param {string} href
   * @param {string} from
   * @param {string} sha
   * @returns {{ href: string, external: boolean } | null}
   */
  function resolveLink(href, from, sha) {
    if (/^(?:https?:|mailto:)/i.test(href)) return { href, external: true };
    /** @type {URL} */
    let url;
    try {
      url = new URL(href, `http://atlas/${data.wiki}/${from}`);
    } catch {
      return null;
    }
    if (url.origin !== "http://atlas") return null; // javascript:, data: and the like go nowhere
    const path = decodeURIComponent(url.pathname.slice(1));
    const anchor = url.hash.slice(1);
    const prefix = `${data.wiki}/`;
    if (path.startsWith(prefix) && path.endsWith(".md"))
      return { href: `#/${path.slice(prefix.length, -3)}${anchor ? `#${anchor}` : ""}`, external: false };
    const target = codeHref(path, Number(anchor.match(/^L(\d+)/)?.[1] ?? 0), sha);
    return target ? { href: target, external: !data.live } : null;
  }

  /**
   * Headings get the ids GitHub would give them, so `[x](#some-heading)` in a page keeps working.
   * @param {string} text
   */
  const slug = (text) => fold(text).replace(/[^\w\s-]/g, "").trim().replace(/\s/g, "-");

  /**
   * Everything marked cannot know: which links are pages, which inline code is a citation, and the
   * ids the table of contents jumps to.
   * @param {Element} prose
   * @param {string} from
   * @param {string} sha
   * @param {Citation[]} citations
   */
  function enhance(prose, from, sha, citations) {
    for (const a of prose.querySelectorAll("a[href]")) {
      const link = resolveLink(a.getAttribute("href") ?? "", from, sha);
      if (!link) {
        a.removeAttribute("href");
        continue;
      }
      a.setAttribute("href", link.href);
      if (link.external) a.setAttribute("target", "_blank"), a.setAttribute("rel", "noopener");
    }
    // A citation is whatever lint counts as one: its list comes from the snapshot, not a regex here.
    for (const code of prose.querySelectorAll(":not(pre) > code")) {
      if (code.closest("a")) continue;
      const citation = citations.find((c) => c.raw === code.textContent);
      const href = citation && codeHref(citation.path, citation.line, sha);
      if (!href) continue;
      const a = document.createElement("a");
      a.href = href;
      if (!data.live) a.target = "_blank", a.rel = "noopener";
      code.replaceWith(a);
      a.append(code);
    }
    /** @type {Map<string, number>} */
    const seen = new Map();
    for (const heading of prose.querySelectorAll("h1, h2, h3, h4")) {
      const base = slug(heading.textContent ?? "");
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      heading.id = count ? `${base}-${count}` : base;
    }
  }

  // ── What goes in <main> ─────────────────────────────────────────────────────────────────────────

  /** @param {AtlasPage} page */
  function renderPage(page) {
    const kind = [escape(page.type || "page")];

    // `synced:` is the commit someone last read this page against the code at; said in words.
    const checked = `${page.date ? `${page.date} · ` : ""}<code>${escape(page.synced)}</code>`;
    const facts = [`<dt>Last checked</dt><dd>${checked}</dd>`];
    const sources = page.sources.map((source) =>
      /[*?]/.test(source) || !/\.\w+$/.test(source) ? `<code>${escape(source)}</code>` : codeLink(source, 0, page.synced),
    );
    facts.push(`<dt>Sources</dt><dd>${bullets(sources)}</dd>`);

    const links = [];
    if (page.related.length) links.push(`<dt>Related</dt><dd>${bullets(page.related.map(pageLink))}</dd>`);
    if (page.backlinks.length) links.push(`<dt>Linked from</dt><dd>${bullets(page.backlinks.map(pageLink))}</dd>`);

    // The two caveats a page can carry, `confidence: inferred` and what drift calls stale, are told
    // in words at the end of the page, where a reader has just read the claims they put in doubt.
    const inferred =
      page.confidence === "inferred"
        ? `<section>
            <h2>Part of this page is a reading, not a fact</h2>
            <p>Whoever wrote it could not find everything it says in the code: some of the intent, the
            reasons or the history is reconstructed, and the page says so rather than guess in silence.
            Take those parts as the likeliest explanation, and correct the page if you know better.</p>
          </section>`
        : "";
    const outdated = page.stale
      ? `<section>
          <h2>This page may be out of date</h2>
          <p>It was last checked against the code on ${checked}. These files have changed since, so what
          it says about them may no longer hold until someone re-reads them and updates the page, which
          is what the <code>wikipoke-ingest</code> skill does:</p>
          ${bullets(page.stale.map((file) => codeLink(file, 0, "")))}
        </section>`
      : "";

    main.innerHTML = `<article>
      <header>
        <p>${kind.join(" ")}</p>
        <h1>${inline(page.title)}</h1>
        <p>${inline(page.responsibility)}</p>
        <dl>${facts.join("")}</dl>
      </header>
      <div class="prose">${markdown.parse(page.body)}</div>
      ${inferred || outdated || links.length ? `<footer>${inferred}${outdated}${links.length ? `<dl>${links.join("")}</dl>` : ""}</footer>` : ""}
    </article>`;
    const prose = main.querySelector(".prose");
    if (prose) enhance(prose, page.rel, page.synced, page.citations);
    return page.title;
  }

  /** @param {AtlasDoc} doc */
  function renderDoc(doc) {
    main.innerHTML = `<article>
      ${doc.id === "index" ? `<header><p>${status()}</p></header>` : ""}
      <div class="prose">${markdown.parse(doc.body)}</div>
    </article>`;
    const prose = main.querySelector(".prose");
    if (prose) enhance(prose, doc.rel, "", []);
    return doc.title;
  }

  /** The wiki in one line: how many pages, how many may be out of date, how far behind the code. */
  function status() {
    const stale = data.pages.filter((page) => page.stale).length;
    const parts = [`${data.pages.length} pages`];
    if (stale) parts.push(`<mark>${stale} may be out of date</mark>`);
    const repo = data.repo;
    if (repo.status === "behind") parts.push(`${repo.commits} ${repo.commits === 1 ? "commit" : "commits"} since the last ingest`);
    else if (repo.status === "no-checkpoint") parts.push("not seeded yet");
    return parts.join(" · ");
  }

  /**
   * A file a page cites, with the cited line marked. Live only: the server hands out files git
   * tracks and nothing else.
   * @param {string} path
   * @param {number} line
   */
  async function renderCode(path, line) {
    const cited = data.pages.filter((page) => page.citations.some((c) => c.path === path));
    const by = cited.map((page) => {
      const lines = page.citations.filter((c) => c.path === path).map((c) => `<a href="#code/${escape(path)}:${c.line}">${c.line}</a>`);
      return `${pageLink(page.id)} <small>${lines.join(", ")}</small>`;
    });
    main.innerHTML = `<article>
      <header>
        <p>code</p>
        <h1><code>${escape(path)}</code></h1>
        ${by.length ? `<dl><dt>Cited by</dt><dd>${bullets(by)}</dd></dl>` : ""}
      </header>
      <p>Loading…</p>
    </article>`;
    const asked = location.hash;
    const res = await fetch(`code/${path.split("/").map(encodeURIComponent).join("/")}`, { cache: "no-store" });
    const text = await res.text();
    if (location.hash !== asked) return; // navigated away while it loaded
    const slot = main.querySelector("article > p");
    if (!res.ok || !slot) return void (slot && (slot.textContent = text));
    const rows = text.replace(/\n$/, "").split("\n");
    const pre = document.createElement("pre");
    pre.innerHTML = rows.map((row, i) => `<span${i + 1 === line ? ' aria-current="true"' : ""}>${escape(row) || " "}</span>`).join("");
    slot.replaceWith(pre);
    pre.querySelector("[aria-current]")?.scrollIntoView({ block: "center" });
    return path;
  }

  // ── The graph ─────────────────────────────────────────────────────────────────────────────────

  /**
   * Every page is a node, and every link between two pages one edge, whichever way it points; the
   * wiki's own files stay out, or index.md would be a hub tied to everything. Colour follows the
   * type in CONVENTIONS.md order: the first in ink, the next four in hues, any others in grey.
   */
  function graphData() {
    const colors = new Map(data.types.map((type, i) => [type, Math.min(i, 5)]));
    /** @type {Map<string, GraphLink>} */
    const links = new Map();
    for (const page of data.pages)
      for (const from of page.backlinks) links.set([from, page.id].sort().join("\n"), { source: from, target: page.id });
    /** @type {Map<string, number>} */
    const degree = new Map();
    for (const { source, target } of links.values()) {
      degree.set(source, (degree.get(source) ?? 0) + 1);
      degree.set(target, (degree.get(target) ?? 0) + 1);
    }
    /** @type {GraphNode[]} */
    const nodes = data.pages.map((page) => ({
      id: page.id,
      title: page.title,
      type: page.type,
      color: colors.get(page.type) ?? 5,
      stale: Boolean(page.stale),
      degree: degree.get(page.id) ?? 0,
    }));
    return { nodes, links: [...links.values()], colors };
  }

  /** @param {string} focus */
  function renderGraph(focus) {
    const { nodes, links, colors } = graphData();
    const lonely = nodes.filter((node) => !node.degree).length;
    const legend = [...new Set(nodes.map((node) => node.type))]
      .sort((a, b) => (colors.get(a) ?? 5) - (colors.get(b) ?? 5))
      .map((type) => {
        const count = nodes.filter((node) => node.type === type).length;
        return `<li>${swatch(`fill: var(--type-${colors.get(type) ?? 5})`)} ${escape(type || "untyped")} <small>${count}</small></li>`;
      });
    if (nodes.some((node) => node.stale)) legend.push(`<li>${swatch("fill: none; stroke: var(--accent); stroke-width: 1.5; stroke-dasharray: 2 1.5")} may be out of date</li>`);
    legend.push("<li>scroll to zoom · drag to move · double-click to fit</li>");
    main.innerHTML = `<article>
      <header>
        <p>graph</p>
        <h1>Graph</h1>
        <p>${nodes.length} pages · ${links.length} links${lonely ? ` · ${lonely} with none` : ""}</p>
      </header>
      <svg role="img" aria-label="Every page of the wiki and the links between them"></svg>
      <ul>${legend.join("")}</ul>
    </article>`;
    const svg = main.querySelector("svg");
    if (svg) views.push(graph.draw(svg, nodes, links, focus ? { mode: "full", focus } : { mode: "full" }));
    return "Graph";
  }

  /** @param {string} style */
  const swatch = (style) => `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" style="${style}"></circle></svg>`;

  /**
   * The page and the pages it touches, beside the page, as Obsidian's local graph does.
   * @param {string} id
   */
  function buildLocal(id) {
    const { nodes, links } = graphData();
    const near = new Set([id]);
    for (const { source, target } of links) {
      if (source === id) near.add(target);
      if (target === id) near.add(source);
    }
    aside.insertAdjacentHTML(
      "beforeend",
      `<h2>Graph</h2><svg role="img" aria-label="This page and the pages it links with"></svg><p><a href="#graph/${escape(id)}">Open the full graph</a></p>`,
    );
    const svg = aside.querySelector("svg");
    if (!svg) return;
    const local = links.filter((link) => near.has(link.source) && near.has(link.target));
    views.push(graph.draw(svg, nodes.filter((node) => near.has(node.id)), local, { mode: "local", focus: id }));
  }

  // ── The sidebar and the table of contents ──────────────────────────────────────────────────────

  /** Pages grouped by type, in the order CONVENTIONS.md lists the types, then the wiki's own files. */
  function buildNav() {
    const extra = data.pages.map((page) => page.type).filter((type) => !data.types.includes(type));
    let html = "";
    for (const type of [...new Set([...data.types, ...extra])]) {
      const ofType = data.pages.filter((page) => page.type === type);
      if (!ofType.length) continue;
      const items = ofType.map((page) => {
        const search = fold(`${page.title} ${page.responsibility} ${page.id}`);
        const hint = `${page.responsibility}${page.stale ? " (may be out of date)" : ""}`;
        return `<a href="#/${escape(page.id)}" title="${escape(hint)}" data-search="${escape(search)}"${page.stale ? " data-stale" : ""}>${escape(page.title)}</a>`;
      });
      html += `<h2>${escape(type || "untyped")}</h2>${bullets(items)}`;
    }
    const docs = [
      `<a href="#graph" data-search="graph">Graph</a>`,
      ...data.docs.map((doc) => `<a href="#/${escape(doc.id)}" data-search="${escape(fold(doc.title))}">${escape(doc.title)}</a>`),
    ];
    list.innerHTML = `${html}<h2>wiki</h2>${bullets(docs)}`;
    applyFilter();
  }

  function applyFilter() {
    const query = fold(filter.value.trim());
    for (const ul of list.querySelectorAll("ul")) {
      let any = false;
      for (const li of ul.querySelectorAll("li")) {
        const show = !query || (li.querySelector("a")?.dataset.search ?? "").includes(query);
        li.hidden = !show;
        any ||= show;
      }
      ul.hidden = !any;
      if (ul.previousElementSibling instanceof HTMLElement) ul.previousElementSibling.hidden = !any;
    }
  }

  /** @param {string} href */
  function markCurrent(href) {
    for (const a of list.querySelectorAll("a")) {
      if (a.getAttribute("href") === href) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
  }

  /** @param {string} id */
  function buildToc(id) {
    const headings = [...main.querySelectorAll(".prose h2, .prose h3")];
    aside.innerHTML = headings.length
      ? `<h2>On this page</h2><ul>${headings
          .map((h) => `<li data-depth="${h.tagName.slice(1)}"><a href="#/${escape(id)}#${h.id}">${escape(h.textContent ?? "")}</a></li>`)
          .join("")}</ul>`
      : "";
    spy();
  }

  /** The heading being read is the last one that has scrolled under the top bar. */
  function spy() {
    const headings = [...main.querySelectorAll(".prose h2, .prose h3")];
    const atBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    let current = atBottom ? headings.at(-1) : undefined;
    if (!current) for (const h of headings) if (h.getBoundingClientRect().top < 120) current = h;
    for (const a of aside.querySelectorAll("aside > ul a")) {
      if (current && a.getAttribute("href")?.endsWith(`#${current.id}`)) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    }
  }

  // ── Routing ─────────────────────────────────────────────────────────────────────────────────────

  /** @returns {{ code: string, line: number } | { graph: string } | { id: string, heading: string }} */
  function route() {
    let hash = location.hash.slice(1);
    try {
      hash = decodeURIComponent(hash);
    } catch {
      // shown as written
    }
    if (hash === "graph" || hash.startsWith("graph/")) return { graph: hash.slice("graph/".length) };
    if (hash.startsWith("code/")) {
      const match = hash.slice("code/".length).match(/^(.*?)(?::(\d+))?$/);
      return { code: match?.[1] ?? "", line: Number(match?.[2] ?? 0) };
    }
    const [id = "", heading = ""] = hash.replace(/^\//, "").split("#");
    return { id: id || "index", heading };
  }

  let shown = "";

  /** @param {{ keepScroll?: boolean }} [options] */
  async function render({ keepScroll = false } = {}) {
    const where = route();
    const y = scrollY;
    // The same page with a heading asked for: only scroll, nothing to redraw.
    if ("id" in where && !keepScroll && where.id === shown && where.heading)
      return void document.getElementById(where.heading)?.scrollIntoView();

    for (const view of views) view.stop();
    views = [];
    if ("graph" in where) {
      shown = "";
      aside.innerHTML = "";
      markCurrent("#graph");
      document.title = `${renderGraph(where.graph)} · ${data.name}`;
      if (!keepScroll) scrollTo(0, 0);
      return;
    }
    if ("code" in where) {
      shown = "";
      aside.innerHTML = "";
      markCurrent("");
      const title = data.live ? await renderCode(where.code, where.line) : undefined;
      if (!data.live) main.innerHTML = `<article><h1>Not here</h1><p>Cited files open only in <code>wikipoke atlas</code>.</p></article>`;
      document.title = `${title ?? where.code} · ${data.name}`;
      return;
    }
    const page = pageById(where.id);
    const doc = docById(where.id);
    const title = page ? renderPage(page) : doc ? renderDoc(doc) : undefined;
    if (!title) main.innerHTML = `<article><h1>No such page</h1><p><code>${escape(where.id)}</code> is not in this wiki. <a href="#/">Back to the index</a>.</p></article>`;
    document.title = `${title ?? "Not found"} · ${data.name}`;
    shown = where.id;
    buildToc(where.id);
    if (page) buildLocal(page.id);
    markCurrent(`#/${where.id}`);
    if (keepScroll) scrollTo(0, y);
    else if (where.heading) document.getElementById(where.heading)?.scrollIntoView();
    else scrollTo(0, 0);
    if (narrow.matches) pages.open = false;
  }

  // ── Start ───────────────────────────────────────────────────────────────────────────────────────

  if (!data) {
    main.innerHTML = `<p>No snapshot: <code>wiki.js</code> is missing next to this page.</p>`;
  } else {
    find("body > header > a > span", HTMLElement).textContent = data.name;
    find("body > header small", HTMLElement).textContent = data.live ? "live" : data.date ?? "";
    if (narrow.matches) pages.open = false;
    buildNav();
    render();
    addEventListener("hashchange", () => render());
    addEventListener("scroll", () => requestAnimationFrame(spy), { passive: true });
    filter.addEventListener("input", applyFilter);
    filter.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const first = list.querySelector("li:not([hidden]) a");
        if (first) location.hash = first.getAttribute("href") ?? "#/";
      } else if (event.key === "Escape") {
        filter.value = "";
        applyFilter();
        filter.blur();
      }
    });
    addEventListener("keydown", (event) => {
      if (event.key !== "/" || document.activeElement instanceof HTMLInputElement) return;
      event.preventDefault();
      pages.open = true;
      filter.focus();
    });

    // Live: the server says when a file in the wiki changed, and the page redraws where it was.
    if (data.live) {
      new EventSource("events").addEventListener("message", async () => {
        const res = await fetch("wiki.json", { cache: "no-store" });
        if (!res.ok) return;
        data = await res.json();
        buildNav();
        render({ keepScroll: true });
      });
    }
  }

  // The theme follows the system; the button flips it for this visit and remembers nothing.
  find("body > header button", HTMLButtonElement).addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
  });
})();
