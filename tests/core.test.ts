import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Wiki } from '../src/wiki.js';
import { parsePage, graph, lint, render } from '../src/knowledge.js';
import { Store, hash, json, read } from '../src/runtime/store.js';
import { install } from '../src/integrations.js';
import type { Config } from '../src/model.js';

const config: Config = { version: 1, wiki: 'wiki', language: 'en', include: ['src/**'], exclude: [],
  limits: { batchFiles: 5 } };
function git(root: string, ...args: string[]) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}
async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'wikipoke-test-'));
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
  mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/main.ts'), 'export const retries = 3;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'initial');
  await Wiki.init(root, config); return new Wiki(root);
}
function patch(sources: any[]) { return { pages: [{ path: 'concepts/retries.md', meta: { type: 'concept', title: 'Retries', description: 'Retry policy',
  sources: sources.map(({ content, ...source }: any) => source), wikipoke: { uid: 'retries', relations: [] } }, body: 'Requests use three retries.' }], findings: [] }; }

test('structured page roundtrip retains unknown metadata and Markdown links', () => {
  const raw = '---\ntype: concept\ntitle: A\ncustom:\n  nested: true\nwikipoke:\n  uid: a\n---\nText [B](./b.md).\n';
  const page = parsePage(raw, 'a.md');
  assert.deepEqual(page.meta.custom, { nested: true });
  assert.deepEqual(parsePage(render(page.meta, page.body), 'a.md').meta.custom, page.meta.custom);
  assert.equal(graph([page]).edges[0].to, 'b.md');
  assert.equal(lint([page])[0].code, 'broken-link');
  assert.throws(() => parsePage('---\ntype: [\n---\nBody', 'bad.md'));
});

test('ingest plans deterministic work and publish validates source evidence', async () => {
  const wiki = await setup();
  assert.deepEqual((await wiki.status()).uncovered, ['src/main.ts']);
  await wiki.publishPatch(patch((await wiki.ingest() as any).sources));
  const page = readFileSync(join(wiki.root, 'wiki/concepts/retries.md'), 'utf8');
  assert.equal((await wiki.ingest() as any).complete, true);
  assert.equal(readFileSync(join(wiki.root, 'wiki/concepts/retries.md'), 'utf8'), page);
  assert.deepEqual((await wiki.status()).uncovered, []);
  writeFileSync(join(wiki.root, 'src/main.ts'), 'export const retries = 4;');
  git(wiki.root, 'add', 'src'); git(wiki.root, 'commit', '-qm', 'change');
  assert.equal((await wiki.status()).drift[0].source, 'src/main.ts');
  await wiki.publishPatch(patch((await wiki.ingest() as any).sources)); assert.deepEqual((await wiki.status()).drift, []);
});

test('queries persist before agent research and deduplicate request IDs', async () => {
  const wiki = await setup();
  await wiki.ask('How many retries?', 'request-1');
  await wiki.ask('How many retries?', 'request-1');
  assert.equal(wiki.pages().length, 1);
  await wiki.answer('request-1', { answer: 'Three retries.', citations: ['src/main.ts'], gaps: [] });
  await wiki.ask('How many retries?', 'request-2');
  assert.equal(wiki.pages().length, 2);
  await assert.rejects(wiki.ask('Different?', 'request-1'), /already used/);
});

test('unknown citations fail without losing the question', async () => {
  const wiki = await setup(); await wiki.ask('Why?', 'q');
  await assert.rejects(wiki.answer('q', { answer: 'Invented', citations: ['missing'], gaps: [] }), /Unknown citation/);
  assert.equal((wiki.pages()[0].meta.wikipoke.query as any).state, 'pending');
});

test('capture preserves declared reasons, is idempotent, and does not certify empty task closure', async () => {
  const wiki = await setup();
  const base = { task: 'Implement retry', actor: 'agent/test', at: '2026-09-08T10:00:00Z' };
  await wiki.capture({ ...base, id: 'open', kind: 'open' });
  await wiki.capture({ ...base, at: '2026-09-08T10:01:00Z', id: 'close', kind: 'close', closure: 'recorded' });
  assert.equal((await wiki.status()).tasks[0].closure, 'incomplete');
  const event = { ...base, id: 'decision', kind: 'decision', choice: 'Use three retries' };
  await wiki.capture(event); await wiki.capture(event);
  assert.equal(wiki.pages().filter(p => p.meta.type === 'decision').length, 1);
  assert.match(wiki.pages().find(p => p.meta.type === 'decision')!.body, /not declared/);
  assert.equal((await wiki.status()).tasks[0].closure, 'recorded');
  await assert.rejects(wiki.capture({ ...event, choice: 'Different' }), /already exists/);
});

test('transaction recovery completes its writes but refuses external changes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wikipoke-store-')), store = new Store(root);
  mkdirSync(join(root, '.wikipoke'));
  writeFileSync(join(root, 'a.md'), 'old');
  writeFileSync(join(root, '.wikipoke/transaction.json'), json({ writes: [{ path: 'a.md', before: 'old', after: 'new' }] }));
  await store.locked(() => {});
  assert.equal(read(join(root, 'a.md')), 'new');
  writeFileSync(join(root, '.wikipoke/transaction.json'), json({ writes: [{ path: 'a.md', before: 'old', after: 'new' }] }));
  writeFileSync(join(root, 'a.md'), 'human edit');
  await assert.rejects(store.locked(() => {}), /Recovery conflict/);
  assert.equal(read(join(root, 'a.md')), 'human edit');
});

test('agent patches cannot escape wiki scope or overwrite concurrent edits', async () => {
  const wiki = await setup(); const plan: any = await wiki.ingest();
  const outside = patch(plan.sources); outside.pages[0].path = '../../outside.md';
  await assert.rejects(wiki.publishPatch(outside), /outside scope/);
  mkdirSync(join(wiki.root, 'wiki/concepts'), { recursive: true });
  writeFileSync(join(wiki.root, 'wiki/concepts/retries.md'), '---\ntype: concept\ntitle: Human\nwikipoke:\n  uid: human\n---\nhuman edit\n');
  await assert.rejects(wiki.publishPatch(patch(plan.sources)), /(Concurrent edit|identity)/);
  assert.match(read(join(wiki.root, 'wiki/concepts/retries.md'))!, /human edit/);
  symlinkSync(tmpdir(), join(wiki.root, 'wiki/escape'));
  assert.throws(() => wiki.store.path('wiki/escape/a.md'), /Symlink/);
});

test('release snapshots retain exact refs and require committed wiki', async () => {
  const wiki = await setup(); await wiki.publishPatch(patch((await wiki.ingest() as any).sources));
  await assert.rejects(wiki.snapshot('v1'), /Commit wiki/);
  git(wiki.root, 'add', 'wiki'); git(wiki.root, 'commit', '-qm', 'wiki');
  const result = await wiki.snapshot('v1');
  assert.equal(git(wiki.root, 'rev-parse', `refs/wikipoke/${hash('v1')}/wiki`), result.wiki);
  await assert.rejects(wiki.snapshot('v1'), /already captured/);
});

test('seal records a checkpoint only after coverage and drift are clear', async () => {
  const wiki = await setup();
  await assert.rejects(wiki.seal(), /pending work/);
  await wiki.publishPatch(patch((await wiki.ingest() as any).sources));
  const sealed = await wiki.seal();
  assert.equal(sealed.lastIndexedCommit, git(wiki.root, 'rev-parse', 'HEAD'));
  assert.equal((await wiki.status()).checkpoint.lastIndexedCommit, sealed.lastIndexedCommit);
});

test('install writes valid agent-neutral skills and preserves foreign skill files', async () => {
  const wiki = await setup(), foreign = join(wiki.root, '.agents/skills/wikipoke-query/SKILL.md');
  mkdirSync(join(wiki.root, '.agents/skills/wikipoke-query'), { recursive: true });
  writeFileSync(foreign, 'foreign skill');
  const report = install(wiki.root);
  assert.ok(existsSync(join(wiki.root, '.agents/skills/wikipoke-ingest/SKILL.md')));
  assert.equal(readFileSync(foreign, 'utf8'), 'foreign skill');
  assert.equal(report.activeHook, true);
  assert.match(readFileSync(join(wiki.root, '.git/hooks/post-commit'), 'utf8'), /wikipoke/);
  assert.match(readFileSync(join(wiki.root, '.agents/skills/wikipoke-ingest/SKILL.md'), 'utf8'), /^---/);
  assert.match(readFileSync(join(wiki.root, '.wikipoke/hooks/post-commit'), 'utf8'), /never runs an LLM/);
});

test('initialization adopts the project wikipokeignore file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wikipoke-ignore-'));
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
  mkdirSync(join(root, 'src')); mkdirSync(join(root, 'wiki'));
  writeFileSync(join(root, 'src/main.ts'), 'export const visible = true;');
  writeFileSync(join(root, 'src/main.test.ts'), 'export const ignored = true;');
  writeFileSync(join(root, '.wikipokeignore'), '# keep comments out\n**/*.test.ts\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'initial');
  const wiki = await Wiki.init(root, config);
  assert.deepEqual(wiki.config.exclude, ['**/*.test.ts']);
  assert.deepEqual((await wiki.status()).uncovered, ['src/main.ts']);
});

test('initialization refuses to overwrite an existing wiki index', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wikipoke-existing-'));
  git(root, 'init', '-q'); mkdirSync(join(root, 'wiki'));
  writeFileSync(join(root, 'wiki/index.md'), '# Existing knowledge\n');
  await assert.rejects(Wiki.init(root, config), /migrate it explicitly/);
  assert.equal(read(join(root, 'wiki/index.md')), '# Existing knowledge\n');
});

test('install preserves an existing post-commit hook', async () => {
  const wiki = await setup();
  const hook = join(wiki.root, '.git/hooks/post-commit');
  writeFileSync(hook, '#!/bin/sh\necho foreign\n');
  const report = install(wiki.root);
  assert.equal(report.activeHook, false);
  assert.ok(report.manual.some(message => /existing post-commit/.test(message)));
  assert.match(readFileSync(hook, 'utf8'), /foreign/);
});

test('captured records use readable slug paths', async () => {
  const wiki = await setup();
  await wiki.ask('How many retries?', 'readable-query');
  await wiki.capture({ id: 'readable-decision', task: 'Improve retry policy', actor: 'agent/test',
    at: '2026-09-09T10:00:00Z', kind: 'decision', choice: 'Use bounded retries' });
  assert.ok(wiki.pages().some(page => /^queries\/how-many-retries-[a-f0-9]{8}\.md$/.test(page.path)));
  assert.ok(wiki.pages().some(page => /^decisions\/use-bounded-retries-[a-f0-9]{8}\.md$/.test(page.path)));
  assert.ok(wiki.pages().some(page => /^watchlogs\/improve-retry-policy-[a-f0-9]{8}\.md$/.test(page.path)));
});
