import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePage, graph, editorialMap, index, lint, loadPages, render, reserved } from '../src/knowledge.js';

test('structured page roundtrip retains unknown metadata and Markdown links', () => {
  const raw = '---\ntype: concept\ntitle: A\ncustom:\n  nested: true\nwikipoke:\n  uid: a\n---\nText [B](./b.md).\n';
  const page = parsePage(raw, 'a.md');
  assert.deepEqual(page.meta.custom, { nested: true });
  assert.deepEqual(parsePage(render(page.meta, page.body), 'a.md').meta.custom, page.meta.custom);
  assert.equal(graph([page]).edges[0].to, 'b.md');
  assert.equal(lint([page])[0].code, 'broken-link');
  assert.throws(() => parsePage('---\ntype: [\n---\nBody', 'bad.md'));
});

test('loading separates readable pages from unreadable files', () => {
  const root = mkdtempSync(join(tmpdir(), 'wikipoke-pages-'));
  writeFileSync(join(root, 'good.md'), '---\ntype: concept\ntitle: Good\nwikipoke:\n  uid: good\n---\nBody\n');
  writeFileSync(join(root, 'notes.md'), 'Human notes without frontmatter\n');
  writeFileSync(join(root, 'partial.md'), '---\ntype: concept\ntitle: Partial\n---\nBody\n');
  const library = loadPages(root);
  assert.deepEqual(library.pages.map(p => p.path), ['good.md']);
  assert.deepEqual(library.unreadable.map(u => u.path), ['notes.md', 'partial.md']);
  assert.match(library.unreadable[0].reason, /frontmatter/);
  assert.match(library.unreadable[1].reason, /wikipoke/);
  assert.equal(library.unreadable[1].reason.includes('\n'), false);
  assert.deepEqual(lint(library.pages, library.unreadable).filter(f => f.code === 'invalid-page'),
    library.unreadable.map(u => ({ code: 'invalid-page', severity: 'error', page: u.path, message: u.reason })));
});

test('rendering keeps only known source fields', () => {
  const meta: any = { type: 'concept', title: 'A', description: '', wikipoke: { uid: 'a', relations: [] },
    sources: [{ id: 'src/a.ts', resource: 'src/a.ts', hash: 'h', content: 'const secret = 1;' }] };
  const raw = render(meta, 'Body');
  assert.equal(raw.includes('secret'), false);
  assert.deepEqual(Object.keys(parsePage(raw, 'a.md').meta.sources[0]).sort(), ['hash', 'id', 'resource']);
});

test('only the generated files at the wiki root are reserved', () => {
  const root = mkdtempSync(join(tmpdir(), 'wikipoke-reserved-'));
  const page = (title: string, uid: string) => `---\ntype: concept\ntitle: ${title}\nwikipoke:\n  uid: ${uid}\n---\nBody\n`;
  writeFileSync(join(root, 'index.md'), '# Knowledge index\n');
  writeFileSync(join(root, 'log.md'), '# Log\n');
  mkdirSync(join(root, 'entities'));
  writeFileSync(join(root, 'entities/index.md'), page('Entities', 'entities'));
  writeFileSync(join(root, 'entities/log.md'), page('Entity log', 'entity-log'));
  const library = loadPages(root);
  assert.deepEqual(library.pages.map(p => p.path), ['entities/index.md', 'entities/log.md']);
  assert.deepEqual(library.unreadable, []);
  assert.deepEqual(reserved, ['index.md', 'log.md']);
});

test('the generated index is an agent navigation map and editorial gaps stay reviewable', () => {
  const page = (path: string, type: string, sources: string[], body: string): any => ({ path, body,
    raw: '', meta: { type, title: path, description: `About ${path}`,
      sources: sources.map(id => ({ id })), wikipoke: { uid: path, relations: [] } } });
  const pages = [
    page('flows/one.md', 'flow', ['src/a.ts', 'src/b.ts'], 'See [two](./two.md).'),
    page('flows/two.md', 'flow', ['src/a.ts', 'src/b.ts'], 'A distinct journey.'),
    page('concepts/lonely.md', 'concept', ['src/c.ts'], 'Standalone.'),
  ];
  const map = editorialMap(pages, ['src/a.ts', 'src/b.ts', 'src/c.ts']);
  assert.deepEqual(map.groups, { concept: ['concepts/lonely.md'], flow: ['flows/one.md', 'flows/two.md'] });
  assert.deepEqual(map.isolated, ['concepts/lonely.md']);
  assert.deepEqual(map.overlaps, [{ pages: ['flows/one.md', 'flows/two.md'],
    sharedSources: ['src/a.ts', 'src/b.ts'] }]);
  const findings = lint(pages, [], 3, {}, ['src/a.ts', 'src/b.ts', 'src/c.ts']);
  assert.equal(findings.some(f => f.code === 'isolated-page'), true);
  assert.equal(findings.some(f => f.code === 'overlapping-pages'), true);
  const generated = index(pages);
  assert.ok(generated.indexOf('## Flows') < generated.indexOf('## Concepts'));
  assert.match(generated, /## Concepts/);
  assert.match(generated, /Sources: `src\/a\.ts`, `src\/b\.ts`/);
  assert.match(generated, /Connects to: \[flows\/two\.md\]\(flows\/two\.md\)/);
  assert.match(index([page('entities/one.md', 'entity', ['src/a.ts'], 'One.')]), /## Entities/);
});
