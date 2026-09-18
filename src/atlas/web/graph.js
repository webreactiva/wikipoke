// @ts-check
// atlas's graph, drawn the way Obsidian draws its own: pages are nodes, links between pages are
// edges, and a small force simulation lays them out. One function draws both views: the full one
// (#graph: every page, zoom, pan) and the local one beside a page (that page and its neighbours).
// No library: a wiki warns past 80 pages, and a few dozen nodes need nothing a hundred lines of
// springs and repulsion cannot do.

/**
 * @typedef {{ id: string, title: string, type: string, color: number, stale: boolean, degree: number }} GraphNode
 * @typedef {{ source: string, target: string }} GraphLink
 * @typedef {{ mode: "full" | "local", focus?: string }} GraphOptions
 * @typedef {{ stop(): void }} GraphView
 * @typedef {{ draw(svg: SVGSVGElement, nodes: GraphNode[], links: GraphLink[], options: GraphOptions): GraphView }} Graph
 * @typedef {GraphNode & { x: number, y: number, vx: number, vy: number, r: number, fixed: boolean }} Particle
 */

(() => {
  const SVG = "http://www.w3.org/2000/svg";

  /** Where each node was last drawn, per view, so a redraw starts where the last one stopped. */
  /** @type {Map<string, { x: number, y: number }>} */
  const placed = new Map();

  /** The full view's camera once someone has zoomed or panned: coming back finds it where it was. */
  /** @type {{ x: number, y: number, k: number } | null} */
  let camera = null;

  /**
   * @param {SVGSVGElement} svg
   * @param {GraphNode[]} nodes
   * @param {GraphLink[]} links
   * @param {GraphOptions} options
   * @returns {GraphView}
   */
  function draw(svg, nodes, links, { mode, focus }) {
    const full = mode === "full";
    const key = (/** @type {string} */ id) => `${mode}:${full ? "" : focus}:${id}`;

    // ── The bodies ────────────────────────────────────────────────────────────────────────────
    /** @type {Particle[]} */
    const bodies = nodes.map((node, i) => {
      // New nodes start on a sunflower spiral: spread out, and the same every time.
      const at = placed.get(key(node.id));
      const angle = i * Math.PI * (3 - Math.sqrt(5));
      const spread = 14 * Math.sqrt(i + 0.5);
      const pinned = !full && node.id === focus;
      return {
        ...node,
        x: pinned ? 0 : (at?.x ?? spread * Math.cos(angle)),
        y: pinned ? 0 : (at?.y ?? spread * Math.sin(angle)),
        vx: 0,
        vy: 0,
        r: 4 + Math.sqrt(node.degree) * 2.2 + (node.id === focus ? 2 : 0),
        fixed: pinned,
      };
    });
    const byId = new Map(bodies.map((body) => [body.id, body]));
    const edges = links.flatMap((link) => {
      const s = byId.get(link.source);
      const t = byId.get(link.target);
      return s && t ? [{ s, t }] : [];
    });
    /** @type {Map<string, Set<string>>} */
    const near = new Map(bodies.map((body) => [body.id, new Set()]));
    for (const { s, t } of edges) near.get(s.id)?.add(t.id), near.get(t.id)?.add(s.id);

    // ── The drawing ───────────────────────────────────────────────────────────────────────────
    const make = (/** @type {string} */ tag) => document.createElementNS(SVG, tag);
    svg.replaceChildren();
    svg.dataset.graph = mode;
    const world = make("g");
    const edgeLayer = make("g");
    const nodeLayer = make("g");
    world.append(edgeLayer, nodeLayer);
    svg.append(world);
    const lines = edges.map(() => edgeLayer.appendChild(make("line")));
    const dots = bodies.map((body) => {
      const a = make("a");
      a.setAttribute("href", `#/${body.id}`);
      a.dataset.id = body.id;
      if (body.id === focus) a.dataset.focus = "";
      const title = make("title");
      title.textContent = `${body.title} · ${body.type}${body.stale ? " · may be out of date" : ""}`;
      const circle = make("circle");
      circle.setAttribute("r", String(body.r));
      circle.setAttribute("style", `fill: var(--type-${body.color})`);
      const label = make("text");
      label.setAttribute("y", String(body.r));
      label.setAttribute("dy", "1.15em");
      label.textContent = body.title;
      a.append(title, circle, label);
      // Stale is a halo around the node rather than its outline, so it reads on any fill.
      if (body.stale) {
        const halo = make("circle");
        halo.setAttribute("r", String(body.r + 3.5));
        halo.dataset.stale = "";
        a.insertBefore(halo, circle);
      }
      nodeLayer.append(a);
      return a;
    });

    // ── The camera ────────────────────────────────────────────────────────────────────────────
    // Until someone zooms or pans, the camera follows the layout and keeps all of it in view.
    let owned = full && camera !== null;
    let view = owned && camera ? { ...camera } : { x: 0, y: 0, k: 1 };
    let width = 0;
    let height = 0;

    function measure() {
      const box = svg.getBoundingClientRect();
      width = box.width;
      height = box.height;
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }

    // Only the nodes are fitted, in world units. Labels keep one size on screen, so they get a
    // margin in pixels instead: fitting them in world units would shrink the camera, which widens
    // them in world units, which shrinks the camera again, frame after frame.
    function fit() {
      if (!bodies.length || !width) return;
      // Beside a page, the page sits pinned at the origin and the camera centres on it, so its
      // label is never the one cut off at an edge.
      if (!full) {
        let reach = 1;
        let depth = 1;
        for (const b of bodies) {
          reach = Math.max(reach, Math.abs(b.x) + b.r);
          depth = Math.max(depth, Math.abs(b.y) + b.r);
        }
        const k = Math.min((width / 2 - 24) / reach, (height / 2 - 30) / depth, 1.5);
        view = { k, x: width / 2, y: height / 2 - 6 };
        return;
      }
      let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const b of bodies) {
        left = Math.min(left, b.x - b.r);
        right = Math.max(right, b.x + b.r);
        top = Math.min(top, b.y - b.r);
        bottom = Math.max(bottom, b.y + b.r);
      }
      const side = 90; // half of a long label, on the outermost nodes
      const above = 28;
      const below = 40; // the label hangs under its node
      const k = Math.min(
        (width - 2 * side) / Math.max(right - left, 1),
        (height - above - below) / Math.max(bottom - top, 1),
        1.5,
      );
      view = { k, x: width / 2 - (k * (left + right)) / 2, y: above + (height - above - below) / 2 - (k * (top + bottom)) / 2 };
    }

    function paint() {
      if (!owned) fit();
      world.setAttribute("transform", `translate(${view.x},${view.y}) scale(${view.k})`);
      // Labels keep their size on screen whatever the zoom, as Obsidian's do.
      nodeLayer.style.fontSize = `${11 / view.k}px`;
      // Zoomed far out, labels become noise: they come back on hover and as you zoom in.
      if (full) svg.dataset.labels = view.k < 0.6 ? "off" : "on";
      edges.forEach(({ s, t }, i) => {
        const line = lines[i];
        if (!line) return;
        line.setAttribute("x1", String(s.x));
        line.setAttribute("y1", String(s.y));
        line.setAttribute("x2", String(t.x));
        line.setAttribute("y2", String(t.y));
      });
      bodies.forEach((b, i) => dots[i]?.setAttribute("transform", `translate(${b.x},${b.y})`));
    }

    // ── The simulation ────────────────────────────────────────────────────────────────────────
    // Every pair repels, every edge is a spring, and a weak pull keeps loose pages from drifting
    // off. Alpha is the temperature: it cools each frame, and the loop stops when it is cold.
    const CHARGE = full ? -650 : -260;
    const LENGTH = full ? 90 : 55;
    // The pull toward the centre is stronger down than across, so the layout spreads to the
    // shape of the canvas instead of stacking into a column on a wide screen.
    const aspect = () => (width && height ? Math.min(Math.max(width / height, 0.5), 2.5) : 1);
    const known = bodies.length > 0 && bodies.every((b) => placed.has(key(b.id)));
    let alpha = known ? 0.05 : 1;
    let target = 0;

    function tick() {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = /** @type {Particle} */ (bodies[i]);
          const b = /** @type {Particle} */ (bodies[j]);
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) (dx = Math.random() - 0.5), (dy = Math.random() - 0.5), (d2 = 1);
          const f = (CHARGE * alpha) / d2;
          a.vx += dx * f;
          a.vy += dy * f;
          b.vx -= dx * f;
          b.vy -= dy * f;
        }
      }
      for (const { s, t } of edges) {
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const d = Math.hypot(dx, dy) || 1;
        const f = ((d - LENGTH) / d) * alpha * 0.25;
        s.vx += dx * f;
        s.vy += dy * f;
        t.vx -= dx * f;
        t.vy -= dy * f;
      }
      for (const b of bodies) {
        if (b.fixed) {
          b.vx = b.vy = 0;
          continue;
        }
        b.vx = (b.vx - (b.x * 0.1 * alpha) / aspect() ** 2) * 0.6;
        b.vy = (b.vy - b.y * 0.1 * alpha) * 0.6;
        b.x += b.vx;
        b.y += b.vy;
      }
      alpha += (target - alpha) * 0.025;
    }

    let frame = 0;
    let stopped = false;
    function loop() {
      frame = 0;
      if (stopped) return;
      tick();
      paint();
      if (alpha > 0.004 || target) frame = requestAnimationFrame(loop);
      else remember();
    }
    function heat(/** @type {number} */ to) {
      target = to;
      alpha = Math.max(alpha, to);
      if (!frame && !stopped) frame = requestAnimationFrame(loop);
    }
    function remember() {
      for (const b of bodies) placed.set(key(b.id), { x: b.x, y: b.y });
      if (full && owned) camera = { ...view };
    }

    // ── Hover: a node and its neighbours stay lit, the rest steps back ────────────────────────
    function light(/** @type {string | null} */ id) {
      const around = id ? near.get(id) : undefined;
      bodies.forEach((b, i) => {
        const on = !id || b.id === id || Boolean(around?.has(b.id));
        dots[i]?.toggleAttribute("data-dim", !on);
        dots[i]?.toggleAttribute("data-lit", Boolean(id) && on);
      });
      edges.forEach(({ s, t }, i) => {
        const on = !id || s.id === id || t.id === id;
        lines[i]?.toggleAttribute("data-dim", !on);
        lines[i]?.toggleAttribute("data-lit", Boolean(id) && on);
      });
    }
    const nodeOf = (/** @type {EventTarget | null} */ element) =>
      element instanceof Element ? element.closest("a")?.dataset.id ?? null : null;

    // ── Dragging a node, panning, zooming ─────────────────────────────────────────────────────
    // A press becomes a drag only after it moves: a plain click on a node is left to its link.
    /** @type {{ body: Particle | null, x: number, y: number, from: { x: number, y: number, k: number }, moved: boolean } | null} */
    let press = null;
    let swallow = false;

    const onDown = (/** @type {PointerEvent} */ event) => {
      if (event.button !== 0) return;
      const id = nodeOf(event.target);
      const body = id ? byId.get(id) ?? null : null;
      if (!body && !full) return;
      press = { body, x: event.clientX, y: event.clientY, from: { ...view }, moved: false };
    };
    const onMove = (/** @type {PointerEvent} */ event) => {
      if (!press) return void light(nodeOf(event.target));
      if (!press.moved) {
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < 4) return;
        press.moved = true;
        try {
          svg.setPointerCapture(event.pointerId); // keeps the drag when the pointer leaves the canvas
        } catch {
          // a pointer that is already gone: the drag simply ends at the edge
        }
      }
      if (press.body) {
        const box = svg.getBoundingClientRect();
        press.body.fixed = true;
        press.body.x = (event.clientX - box.left - view.x) / view.k;
        press.body.y = (event.clientY - box.top - view.y) / view.k;
        heat(0.3);
      } else {
        owned = true;
        view = { ...view, x: press.from.x + event.clientX - press.x, y: press.from.y + event.clientY - press.y };
        paint();
      }
    };
    const onUp = () => {
      if (press?.body) {
        press.body.fixed = !full && press.body.id === focus;
        heat(0);
      }
      swallow = Boolean(press?.moved);
      press = null;
      remember();
    };
    const onClick = (/** @type {MouseEvent} */ event) => {
      if (swallow) event.preventDefault();
      swallow = false;
    };
    const onWheel = (/** @type {WheelEvent} */ event) => {
      event.preventDefault();
      const box = svg.getBoundingClientRect();
      const px = event.clientX - box.left;
      const py = event.clientY - box.top;
      const k = Math.min(4, Math.max(0.15, view.k * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015))));
      view = { k, x: px - ((px - view.x) * k) / view.k, y: py - ((py - view.y) * k) / view.k };
      owned = true;
      paint();
      remember();
    };
    const onDoubleClick = (/** @type {MouseEvent} */ event) => {
      if (nodeOf(event.target)) return;
      owned = false;
      camera = null;
      paint();
    };

    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    svg.addEventListener("pointerleave", () => press || light(null));
    svg.addEventListener("focusin", (event) => light(nodeOf(event.target)));
    svg.addEventListener("focusout", () => light(null));
    svg.addEventListener("click", onClick);
    if (full) {
      svg.addEventListener("wheel", onWheel, { passive: false });
      svg.addEventListener("dblclick", onDoubleClick);
    }

    const resize = new ResizeObserver(() => {
      measure();
      paint();
    });
    resize.observe(svg);
    measure();

    // Someone who asked for less motion gets the layout already settled.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      while (alpha > 0.004) tick();
      paint();
      remember();
    } else {
      paint();
      heat(0);
    }

    return {
      stop() {
        stopped = true;
        cancelAnimationFrame(frame);
        resize.disconnect();
        remember();
      },
    };
  }

  /** @type {any} */ (globalThis).atlasGraph = /** @type {Graph} */ ({ draw });
})();
