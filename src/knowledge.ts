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
export function graph(pages: Page[]) {
  const edges: Edge[] = [];
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
    for (const s of page.meta.sources) edges.push({ from: page.path, to: s.resource, type: 'source', evidence: [s.id] });
  }
  const normalized = edges.map(e => ['related_to', 'contradicts'].includes(e.type) && e.from > e.to
    ? { ...e, from: e.to, to: e.from } : e);
  return { nodes: pages.map(p => ({ id: p.path, uid: p.meta.wikipoke.uid, type: p.meta.type, title: p.meta.title })),
    edges: [...new Map(normalized.map(e => [`${e.from}\0${e.type}\0${e.to}`, e])).values()] };
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
  const { edges } = graph(pages);
  for (const e of edges.filter(e => e.type !== 'source')) {
    if (!paths.has(e.to)) findings.push({ code: 'broken-link', severity: 'warning', page: e.from, message: e.to });
  }
  const replacements = edges.filter(e => e.type === 'supersedes');
  const cycle = (id: string, visiting: Set<string>): boolean => {
    if (visiting.has(id)) return true;
    return replacements.filter(e => e.from === id).some(e => cycle(e.to, new Set([...visiting, id])));
  };
  for (const p of pages) if (cycle(p.path, new Set())) findings.push({ code: 'replacement-cycle', severity: 'error', page: p.path, message: 'Cyclic supersession' });
  return findings;
}
export function index(pages: Page[]): string {
  return '# Knowledge index\n\n' + pages.map(p => `- [${p.meta.title.replace(/[\[\]\n]/g, '')}](${p.path}) - ${p.meta.description.replace(/\n/g, ' ')}`).join('\n') + '\n';
}
