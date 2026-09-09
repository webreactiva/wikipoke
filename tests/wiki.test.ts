import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Wiki } from '../src/wiki.js';
import { hash, read } from '../src/runtime/store.js';
import type { Config } from '../src/model.js';

const config: Config = { version: 1, wiki: 'wiki', language: 'en', include: ['src/**'], exclude: [],
  limits: { batchFiles: 5, batchBytes: 64 * 1024 } };
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

test('unknown citations fail without losing the question or the attempt', async () => {
  const wiki = await setup(); await wiki.ask('Why?', 'q');
  await assert.rejects(wiki.answer('q', { answer: 'Invented', citations: ['missing'], gaps: [] }), /Unknown citation/);
  const page = wiki.pages()[0], query = page.meta.wikipoke.query as any;
  assert.notEqual(query.state, 'answered');
  assert.equal(query.attempts.at(-1).state, 'failed');
  assert.match(query.attempts.at(-1).reason, /Unknown citation: missing/);
  assert.match(page.body, /Unknown citation: missing/);
});

test('answers cite evidence or declare the gaps that leave them unsupported', async () => {
  const wiki = await setup(); await wiki.ask('Why three retries?', 'evidence');
  await assert.rejects(wiki.answer('evidence', { answer: 'Because.', citations: [], gaps: [] }), /evidence/);
  const ungrounded: any = await wiki.answer('evidence', { answer: 'Because.', citations: [],
    gaps: ['No source explains the choice'] });
  assert.equal(ungrounded.state, 'unsupported');
  const grounded: any = await wiki.answer('evidence', { answer: 'Three.', citations: ['src/main.ts'], gaps: [] });
  assert.equal(grounded.state, 'answered');
  assert.deepEqual(grounded.attempts.map((a: any) => a.state), ['pending', 'failed', 'unsupported', 'answered']);
});

test('a failed attempt never erases the answer already recorded', async () => {
  const wiki = await setup(); await wiki.ask('How many retries?', 'kept');
  await wiki.answer('kept', { answer: 'Unclear.', citations: [], gaps: ['No source states it'] });
  await assert.rejects(wiki.answer('kept', { answer: 'Invented', citations: ['missing.ts'], gaps: [] }), /Unknown citation/);
  const kept = wiki.pages()[0], query = kept.meta.wikipoke.query as any;
  assert.match(kept.body, /# Answer\n\nUnclear\./);
  assert.match(kept.body, /# Gaps\n\nNo source states it/);
  assert.equal(query.answer, 'Unclear.');
  assert.equal(query.state, 'unsupported');
  assert.equal(query.attempts.at(-1).state, 'failed');
  await wiki.answer('kept', { answer: 'Three.', citations: ['src/main.ts'], gaps: [] });
  const answered = wiki.pages()[0];
  assert.match(answered.body, /# Answer\n\nThree\./);
  await assert.rejects(wiki.answer('kept', { answer: 'Four.', citations: ['src/main.ts'], gaps: [] }), /already answered/);
  await assert.rejects(wiki.answer('kept', { answer: 'Four.', citations: ['missing.ts'], gaps: [] }), /already answered/);
  assert.equal(wiki.pages()[0].raw, answered.raw);
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
  const decision = wiki.pages().find(p => p.meta.type === 'decision')!.meta.wikipoke as any;
  assert.deepEqual(Object.keys(decision.decision).sort(), ['actor', 'at', 'eventId']);
  await assert.rejects(wiki.capture({ ...event, choice: 'Different' }), /already exists/);
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
  await assert.rejects(wiki.seal(), /pending work: 1 uncovered source/);
  await wiki.publishPatch(patch((await wiki.ingest() as any).sources));
  const sealed = await wiki.seal();
  assert.equal(sealed.lastIndexedCommit, git(wiki.root, 'rev-parse', 'HEAD'));
  assert.equal((await wiki.status()).checkpoint.lastIndexedCommit, sealed.lastIndexedCommit);
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
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
  writeFileSync(join(root, 'seed.txt'), 'seed\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'initial');
  mkdirSync(join(root, 'wiki'));
  writeFileSync(join(root, 'wiki/index.md'), '# Existing knowledge\n');
  await assert.rejects(Wiki.init(root, config), /migrate it explicitly/);
  assert.equal(read(join(root, 'wiki/index.md')), '# Existing knowledge\n');
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

test('an unreadable page is reported as a finding instead of breaking every command', async () => {
  const wiki = await setup();
  const notes = join(wiki.root, 'wiki/NOTAS.md');
  writeFileSync(notes, 'Human notes without frontmatter\n');
  const status = await wiki.status();
  const finding = status.findings.find(f => f.code === 'invalid-page');
  assert.equal(finding?.page, 'NOTAS.md');
  assert.match(finding!.message, /frontmatter/);
  assert.equal(status.pages, 0);
  assert.ok((await wiki.lint()).some(f => f.code === 'invalid-page'));
  await wiki.publishPatch(patch((await wiki.ingest() as any).sources));
  assert.deepEqual((await wiki.status()).uncovered, []);
  await wiki.ask('Anything?', 'unreadable');
  await wiki.capture({ id: 'unreadable-event', task: 'Keep working', actor: 'agent/test',
    at: '2026-09-09T10:00:00Z', kind: 'open' });
  await assert.rejects(wiki.seal(), /1 error finding/);
  assert.equal(read(notes), 'Human notes without frontmatter\n');
});

test('publishing never copies source content into the frontmatter', async () => {
  const wiki = await setup();
  const plan: any = await wiki.ingest();
  await wiki.publishPatch({ revision: plan.revision, findings: [], pages: [{ path: 'concepts/retries.md',
    meta: { type: 'concept', title: 'Retries', description: 'Retry policy', sources: plan.sources,
      wikipoke: { uid: 'retries', relations: [] } }, body: 'Requests use three retries.' }] });
  const page = readFileSync(join(wiki.root, 'wiki/concepts/retries.md'), 'utf8');
  assert.equal(page.includes('export const retries'), false);
  assert.deepEqual(Object.keys(wiki.pages()[0].meta.sources[0]).sort(), ['hash', 'id', 'resource', 'revision']);
});

test('publish refuses a patch planned on a superseded revision', async () => {
  const wiki = await setup();
  const plan: any = await wiki.ingest();
  writeFileSync(join(wiki.root, 'src/extra.ts'), 'export const extra = 1;\n');
  git(wiki.root, 'add', '.'); git(wiki.root, 'commit', '-qm', 'extra');
  await assert.rejects(wiki.publishPatch({ ...patch(plan.sources), revision: plan.revision }), /plan again/);
  const replanned: any = await wiki.ingest();
  await wiki.publishPatch({ ...patch(replanned.sources), revision: replanned.revision });
  assert.deepEqual((await wiki.status()).uncovered, []);
});

test('attention writes a bounded signal instead of the whole graph', async () => {
  const wiki = await setup();
  for (let i = 0; i < 12; i++) writeFileSync(join(wiki.root, `src/file${i}.ts`), `export const n${i} = ${i};\n`);
  git(wiki.root, 'add', '.'); git(wiki.root, 'commit', '-qm', 'many sources');
  const signal = await wiki.attention();
  assert.equal(signal.uncovered.count, 13);
  assert.equal(signal.uncovered.sample.length, 10);
  assert.equal(signal.checkpoint, null);
  assert.deepEqual(Object.keys(signal.findings).sort(), ['error', 'warning']);
  assert.equal('graph' in signal, false);
  assert.deepEqual(JSON.parse(read(join(wiki.root, '.wikipoke/attention.json'))!), signal);
  await wiki.publishPatch(patch((await wiki.ingest() as any).sources));
  assert.deepEqual((await wiki.graph()).nodes.map(n => n.id), wiki.pages().map(p => p.path));
});

test('a page published under a nested index name stays visible to the wiki', async () => {
  const wiki = await setup();
  const plan: any = await wiki.ingest(), sources = plan.sources.map(({ content, ...s }: any) => s);
  const page = (path: string, uid: string) => ({ path, meta: { type: 'concept', title: uid, description: uid,
    sources, wikipoke: { uid, relations: [] } }, body: 'Text.' });
  const result: any = await wiki.publishPatch({ revision: plan.revision, findings: [],
    pages: [page('entities/index.md', 'entities-index'), page('entities/real.md', 'real')] });
  assert.deepEqual(result.published, ['entities/index.md', 'entities/real.md']);
  const status = await wiki.status();
  assert.equal(status.pages, 2);
  assert.deepEqual(status.findings.filter(f => f.code === 'invalid-page'), []);
  assert.deepEqual((await wiki.graph()).nodes.map(n => n.id), ['entities/index.md', 'entities/real.md']);
  assert.match(read(join(wiki.root, 'wiki/index.md'))!, /\(entities\/index\.md\)/);
  assert.equal(wiki.pages().some(p => p.path === 'index.md'), false);
  await assert.rejects(wiki.publishPatch({ ...patch(plan.sources), pages: [page('index.md', 'root')] }), /Invalid concept path/);
});

test('publishing over an unreadable page names the real cause', async () => {
  const wiki = await setup();
  const plan: any = await wiki.ingest(), notes = join(wiki.root, 'wiki/concepts/retries.md');
  mkdirSync(join(wiki.root, 'wiki/concepts'), { recursive: true });
  writeFileSync(notes, 'Human notes without frontmatter\n');
  await assert.rejects(wiki.publishPatch(patch(plan.sources)),
    /Cannot publish over an unreadable page: concepts\/retries\.md \(missing YAML frontmatter\)/);
  assert.equal(read(notes), 'Human notes without frontmatter\n');
});

test('a plan is bounded by bytes as well as by file count', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wikipoke-budget-'));
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
  mkdirSync(join(root, 'src'));
  const line = 'export const value = 1;\n';
  for (let n = 0; n < 4; n++) writeFileSync(join(root, `src/mod${n}.ts`), line.repeat(200));
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'initial');
  await Wiki.init(root, { ...config, limits: { batchFiles: 5, batchBytes: line.length * 300 } });
  const plan: any = await new Wiki(root).ingest();
  assert.equal(plan.sources.length, 1, 'the byte budget stops the batch before the file count does');
  assert.equal(plan.remaining, 3);
  assert.equal(plan.complete, false);
});

test('a source larger than the budget is planned instead of blocking the queue', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wikipoke-oversized-'));
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/huge.ts'), 'export const value = 1;\n'.repeat(500));
  writeFileSync(join(root, 'src/small.ts'), 'export const other = 2;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'initial');
  await Wiki.init(root, { ...config, limits: { batchFiles: 5, batchBytes: 16 } });
  const plan: any = await new Wiki(root).ingest();
  assert.deepEqual(plan.sources.map((source: any) => source.id), ['src/huge.ts']);
  assert.equal(plan.remaining, 1);
});

test('a task that records no decision leaves a tape but no wiki page', async () => {
  const wiki = await setup();
  const base = { task: 'read the registry', actor: 'agent/test', at: '2026-09-09T10:00:00Z' };
  const opened: any = await wiki.capture({ ...base, id: 'e1', kind: 'open' });
  assert.equal(opened.materialized, false);
  const closed: any = await wiki.capture({ ...base, id: 'e2', kind: 'close', closure: 'none_declared',
    rationale: 'Documentation-only task; nobody stated a choice.' });
  assert.equal(closed.materialized, false);
  assert.equal(wiki.pages().some(page => page.meta.type === 'watchlog'), false);
  assert.equal(existsSync(join(wiki.root, 'wiki/watchlogs')), false);
  // The tape is durable even though nothing was published.
  assert.equal(wiki.events().filter(event => event.task === base.task).length, 2);

  const recorded: any = await wiki.capture({ ...base, id: 'e3', kind: 'decision',
    choice: 'The registry stays a plain map', rationale: 'A map keeps the bundle tree-shakeable.' });
  assert.equal(recorded.materialized, true);
  const log = wiki.pages().find(page => page.meta.type === 'watchlog')!;
  assert.match(log.body, /Task opened/);
  assert.match(log.body, /The registry stays a plain map/);
  assert.match(log.body, /none_declared/);
});

test('the knowledge index carries knowledge, not the event tape', async () => {
  const wiki = await setup();
  await wiki.publishPatch(patch((await wiki.ingest() as any).sources));
  const base = { task: 'pick a retry count', actor: 'agent/test', at: '2026-09-09T10:00:00Z' };
  await wiki.capture({ ...base, id: 'd1', kind: 'decision', choice: 'Three retries', rationale: 'Measured tail latency.' });
  assert.equal(wiki.pages().some(page => page.meta.type === 'watchlog'), true);
  const written = readFileSync(join(wiki.root, 'wiki/index.md'), 'utf8');
  assert.match(written, /concepts\/retries\.md/);
  assert.match(written, /decisions\//);
  assert.doesNotMatch(written, /watchlogs\//);
});
