import { relative, posix } from 'node:path';
import { parseDocument, stringify } from 'yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import { visit } from 'unist-util-visit';
import { pageSchema, type Page, type Metadata, type Finding } from './model.js';
import { files, read } from './runtime/store.js';

const parser = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']);
// Wikipoke generates these at the wiki root; anywhere deeper they are ordinary pages.
export const reserved = ['index.md', 'log.md'];
export interface Unreadable { path: string; reason: string }
export interface Library { pages: Page[]; unreadable: Unreadable[] }
export function parsePage(raw: string, path: string): Page {
  const tree = parser.parse(raw), first = tree.children[0];
  if (first?.type !== 'yaml') throw new Error(`${path}: missing YAML frontmatter`);
  const doc = parseDocument((first as unknown as { value: string }).value);
  if (doc.errors.length) throw new Error(`${path}: ${doc.errors[0].message.split('\n')[0]}`);
  const meta = pageSchema.safeParse(doc.toJS());
  if (!meta.success) throw new Error(`${path}: ${meta.error.issues
    .map(i => `${i.path.join('.') || 'frontmatter'} ${i.message.split('\n')[0]}`).join('; ')}`);
  return { path, meta: meta.data, raw, body: raw.slice(first.position!.end.offset).replace(/^\r?\n/, '') };
}
export function render(meta: Metadata, body: string): string {
  return `---\n${stringify(pageSchema.parse(meta))}---\n${body.trim()}\n`;
}
export function loadPages(root: string): Library {
  const pages: Page[] = [], unreadable: Unreadable[] = [];
  for (const file of files(root).filter(p => p.endsWith('.md'))) {
    const path = relative(root, file).split('\\').join('/');
    if (reserved.includes(path)) continue;
    try { pages.push(parsePage(read(file)!, path)); }
    catch (error) {
      const reason = (error as Error).message;
      unreadable.push({ path, reason: reason.startsWith(`${path}: `) ? reason.slice(path.length + 2) : reason });
    }
  }
  return { pages, unreadable };
}
export interface Edge { from: string; to: string; type: string; evidence: string[] }
export function target(from: string, value: string): string {
  const path = decodeURIComponent(value.split('#')[0]);
  return posix.normalize(path.startsWith('/') ? path.slice(1) : posix.join(posix.dirname(from), path || posix.basename(from)));
}
// Relations whose meaning does not depend on which end you read first. The graph stores one edge per
// symmetric pair with its ends in a fixed order, so a reader never sees the same fact twice - and
// declares the list in its output, because "no reciprocal pair exists" is otherwise indistinguishable
// from "the writer only ever recorded one direction".
export const symmetric = ['related_to'];
export function graph(pages: Page[]) {
  const edges: Edge[] = [];
  // Obsidian resolves `[[note]]` by name across the whole vault and `[[folder/note]]` from its root,
  // never relative to the page holding the link. An ambiguous bare name resolves to nothing rather
  // than to whichever page happened to be read first.
  const byName = new Map<string, string | null>();
  for (const page of pages) {
    const name = posix.basename(page.path, '.md');
    byName.set(name, byName.has(name) ? null : page.path);
  }
  for (const page of pages) {
    for (const relation of page.meta.wikipoke.relations)
      edges.push({ from: page.path, to: target(page.path, relation.target), type: relation.type, evidence: relation.evidence });
    const tree = parser.parse(page.body), definitions = new Map<string, string>();
    visit(tree, 'definition', node => { definitions.set(node.identifier, node.url); });
    const link = (url: string) => {
      if (!/^[a-z][a-z\d+.-]*:/i.test(url)) edges.push({ from: page.path,
        to: target(page.path, url), type: 'links_to', evidence: [] });
    };
    visit(tree, 'link', node => link(node.url));
    visit(tree, 'linkReference', node => { const url = definitions.get(node.identifier); if (url) link(url); });
    // Wikipoke writes ordinary Markdown links, which render everywhere. It reads `[[wikilinks]]` too,
    // because a wiki people browse in Obsidian is a wiki people actually open. Only text nodes are
    // scanned, so a pair of brackets inside a code block is code, not an edge.
    visit(tree, 'text', node => {
      for (const [, name] of node.value.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)) {
        const wanted = name.trim().replace(/\.md$/, '');
        if (!wanted) continue;
        const resolved = wanted.includes('/') ? `/${wanted}.md` : byName.get(wanted);
        if (resolved) link(resolved.startsWith('/') ? resolved : `/${resolved}`);
      }
    });
    // The evidence for a provenance edge is the source it points at, so it is only worth stating when
    // the resource read differs from the id it is known by - with a Git adapter it never does.
    for (const s of page.meta.sources) {
      const to = s.resource ?? s.id;
      edges.push({ from: page.path, to, type: 'source', evidence: to === s.id ? [] : [s.id] });
    }
  }
  const normalized = edges.map(e => symmetric.includes(e.type) && e.from > e.to
    ? { ...e, from: e.to, to: e.from } : e);
  return { nodes: pages.map(p => ({ id: p.path, uid: p.meta.wikipoke.uid, type: p.meta.type, title: p.meta.title })),
    edges: [...new Map(normalized.map(e => [`${e.from}\0${e.type}\0${e.to}`, e])).values()], symmetric };
}
export function lint(pages: Page[], unreadable: Unreadable[] = []): Finding[] {
  const findings: Finding[] = [], paths = new Set(pages.map(p => p.path)), ids = new Set<string>();
  for (const u of unreadable) findings.push({ code: 'invalid-page', severity: 'error', page: u.path, message: u.reason });
  for (const p of pages) {
    if (ids.has(p.meta.wikipoke.uid)) findings.push({ code: 'duplicate-id', severity: 'error', page: p.path, message: p.meta.wikipoke.uid });
    ids.add(p.meta.wikipoke.uid);
    const sources = new Set(p.meta.sources.map(s => s.id));
    for (const r of p.meta.wikipoke.relations) for (const id of r.evidence)
      if (!sources.has(id)) findings.push({ code: 'unknown-evidence', severity: 'error', page: p.path, message: id });
  }
  // A flow is the page type that cannot be derived from one file: it is the sequence several files
  // make together, and the reason the order is what it is. Reconciling a diff never asks for one,
  // because no single source went uncovered by its absence, so the gap has to be named here or the
  // wiki reads complete while missing the knowledge that justified building it.
  const described = pages.filter(p => !['query', 'decision', 'flow'].includes(p.meta.type));
  const flows = pages.filter(p => p.meta.type === 'flow');
  if (described.length >= 3 && !flows.length)
    findings.push({ code: 'no-flows', severity: 'warning',
      message: `${described.length} pages describe code and none describes a flow through it` });
  for (const flow of flows) if (flow.meta.sources.length < 2)
    findings.push({ code: 'thin-flow', severity: 'warning', page: flow.path,
      message: 'A flow crosses files; this one cites fewer than two sources' });
  const { edges } = graph(pages);
  for (const e of edges.filter(e => e.type !== 'source')) {
    if (!paths.has(e.to)) findings.push({ code: 'broken-link', severity: 'warning', page: e.from, message: e.to });
  }
  // A cycle in a directed relation is a claim that cannot be true of both ends at once. Supersession
  // is an error because it makes the replacement order undecidable; a dependency cycle is a warning
  // because code really does contain them, and the wiki's job is to show it, not to refuse it.
  const cyclic = (type: string) => {
    const directed = edges.filter(e => e.type === type);
    const walk = (id: string, visiting: Set<string>): boolean => visiting.has(id) ||
      directed.filter(e => e.from === id).some(e => walk(e.to, new Set([...visiting, id])));
    return pages.filter(p => walk(p.path, new Set())).map(p => p.path);
  };
  for (const path of cyclic('supersedes'))
    findings.push({ code: 'replacement-cycle', severity: 'error', page: path, message: 'Cyclic supersession' });
  for (const path of cyclic('depends_on'))
    findings.push({ code: 'dependency-cycle', severity: 'warning', page: path, message: 'Cyclic dependency' });
  return findings;
}
// The index answers "what does this project know", so it carries knowledge only. Process — the event
// tape of a task, the chronology of what changed — is not knowledge and is not listed here; it lives
// in .wikipoke/events and in the generated log, reachable through the decision pages and the graph.
export function index(pages: Page[]): string {
  return '# Knowledge index\n\n' + pages.map(p => `- [${p.meta.title.replace(/[\[\]\n]/g, '')}](${p.path}) - ${p.meta.description.replace(/\n/g, ' ')}`).join('\n') + '\n';
}
