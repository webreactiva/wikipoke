import { relative, posix } from 'node:path';
import { parseDocument, stringify } from 'yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import { visit } from 'unist-util-visit';
import { z } from 'zod';
import { covers, draftSchema, pageSchema, type Draft, type Page, type Metadata, type Finding } from './model.js';
import { files, read } from './runtime/store.js';

const parser = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']);
// Wikipoke generates these at the wiki root; anywhere deeper they are ordinary pages.
export const reserved = ['index.md', 'log.md'];
export interface Unreadable { path: string; reason: string; code: string }
// Git writes these, not a person. A page carrying them is not an edit anybody made and nobody wants
// it kept, which is why it is worth telling apart from a page a human is halfway through writing.
const conflicted = /^(<{7}|={7}|>{7})/m;
export interface Library { pages: Page[]; unreadable: Unreadable[] }
function split(raw: string, path: string): { frontmatter: unknown; body: string } {
  const tree = parser.parse(raw), first = tree.children[0];
  if (first?.type !== 'yaml') throw new Error(`${path}: missing YAML frontmatter`);
  const doc = parseDocument((first as unknown as { value: string }).value);
  if (doc.errors.length) throw new Error(`${path}: ${doc.errors[0].message.split('\n')[0]}`);
  return { frontmatter: doc.toJS(), body: raw.slice(first.position!.end.offset).replace(/^\r?\n/, '') };
}
function fault(path: string, error: z.ZodError): Error {
  return new Error(`${path}: ${error.issues
    .map(i => `${i.path.join('.') || 'frontmatter'} ${i.message.split('\n')[0]}`).join('; ')}`);
}
export function parsePage(raw: string, path: string): Page {
  const { frontmatter, body } = split(raw, path);
  const meta = pageSchema.safeParse(frontmatter);
  if (!meta.success) throw fault(path, meta.error);
  return { path, meta: meta.data, raw, body };
}
// The same file, read as an agent wrote it rather than as Wikipoke stamped it: sources are patterns
// and the uid may be absent. Reading drafts from a directory is the whole publication surface -
// Markdown in, Markdown out, with nothing in between for anyone to assemble.
export function readDrafts(directory: string): Draft[] {
  const found = files(directory).filter(p => p.endsWith('.md'));
  if (!found.length) throw new Error(`No .md pages in ${directory}; write each page as Markdown with frontmatter, then publish the directory`);
  return found.map(file => {
    const path = relative(directory, file).split('\\').join('/');
    const { frontmatter, body } = split(read(file)!, path);
    const meta = draftSchema.safeParse(frontmatter);
    if (!meta.success) throw fault(path, meta.error);
    return { path, meta: meta.data, body };
  });
}
export function render(meta: Metadata, body: string): string {
  return `---\n${stringify(pageSchema.parse(meta))}---\n${body.trim()}\n`;
}
export function loadPages(root: string): Library {
  const pages: Page[] = [], unreadable: Unreadable[] = [];
  for (const file of files(root).filter(p => p.endsWith('.md'))) {
    const path = relative(root, file).split('\\').join('/');
    if (reserved.includes(path)) continue;
    const raw = read(file)!;
    try { pages.push(parsePage(raw, path)); }
    catch (error) {
      const reason = (error as Error).message;
      unreadable.push({ path, code: conflicted.test(raw) ? 'conflict-markers' : 'invalid-page',
        reason: conflicted.test(raw)
          ? 'Unresolved merge conflict markers; publish may overwrite this page, or resolve it by hand'
          : reason.startsWith(`${path}: `) ? reason.slice(path.length + 2) : reason });
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
export function lint(pages: Page[], unreadable: Unreadable[] = [], sourceCount = 0): Finding[] {
  const findings: Finding[] = [], paths = new Set(pages.map(p => p.path)), ids = new Set<string>();
  for (const u of unreadable) findings.push({ code: u.code, severity: 'error', page: u.path, message: u.reason });
  for (const p of pages) {
    if (ids.has(p.meta.wikipoke.uid)) findings.push({ code: 'duplicate-id', severity: 'error', page: p.path, message: p.meta.wikipoke.uid });
    ids.add(p.meta.wikipoke.uid);
    // Evidence names a file; a source is a pattern. Comparing the two as strings meant a page
    // claiming `apps/playground/src/**` could not cite a file inside it - the page covers the file,
    // the relation is about the file, and the only way out was to delete the relation.
    const patterns = p.meta.sources.map(s => s.id);
    for (const r of p.meta.wikipoke.relations) for (const id of r.evidence)
      if (!patterns.some(pattern => covers(pattern, id))) findings.push({ code: 'unknown-evidence',
        severity: 'error', page: p.path,
        message: `${id} is outside every source this page claims${patterns.length ? `: ${patterns.join(', ')}` : ''}` });
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
  // Coverage is set membership: citing a source covers it, and citing costs nothing. One page with
  // one sentence citing every file in a repository reports the wiki as fully covered. This is the
  // cheapest check that tells that page apart from a real one: how much prose it spends per source
  // it claims. Calibrated against two real wikis - the thinnest genuine page spends 120 characters
  // per source and the most extreme index page 32, while the degenerate case spends about one.
  for (const p of pages) {
    if (p.meta.sources.length < 3 || ['query', 'decision'].includes(p.meta.type)) continue;
    const spent = p.body.trim().length / p.meta.sources.length;
    if (spent < 25) findings.push({ code: 'thin-coverage', severity: 'warning', page: p.path,
      message: `Claims ${p.meta.sources.length} sources in ${p.body.trim().length} characters; a citation is not a description` });
  }
  // The other way to reach full coverage without writing a wiki: one page per file, named after the
  // path, mirroring the tree. Every source is claimed, every check is green, and the result restates
  // what the code already says instead of carrying what it cannot. Measured on two real wikis: the
  // one written as knowledge has 13% single-source pages at 0.36 pages per source, the one written
  // as a mirror has 98% at 1.01. This only speaks for a wiki large enough for the shape to mean
  // something.
  const described_ = pages.filter(p => !['query', 'decision'].includes(p.meta.type));
  const single = described_.filter(p => p.meta.sources.length === 1).length;
  if (sourceCount >= 30 && described_.length >= sourceCount * 0.8 && single >= described_.length * 0.7)
    findings.push({ code: 'mirrors-the-tree', severity: 'warning',
      message: `${described_.length} pages for ${sourceCount} sources, ${single} of them citing a single file: a wiki shaped like the file tree restates the code instead of carrying what the code cannot say` });
  const { edges } = graph(pages);
  for (const e of edges.filter(e => e.type !== 'source')) {
    // Both ends, not just the target. A symmetric relation is stored with its ends in a fixed order,
    // so a `related_to` pointing at a page that does not exist can end up as the *from* of its own
    // edge - and checking only the target reported nothing at all.
    const source = paths.has(e.from) ? e.from : e.to;
    for (const end of new Set([e.from, e.to])) {
      if (paths.has(end)) continue;
      // A `../` from a page at the wiki root resolves to a path above the wiki, which is not a page
      // anybody can create and not a link any amount of moving will fix. Reported as itself, because
      // "broken link to ../thing.md" reads as a page that is merely missing.
      if (end.startsWith('../')) findings.push({ code: 'link-escapes-wiki', severity: 'warning', page: source,
        message: `${end} points above the wiki root; a page at the root has nothing above it, so link it by its path inside the wiki` });
      else findings.push({ code: 'broken-link', severity: 'warning', page: source, message: end });
    }
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
