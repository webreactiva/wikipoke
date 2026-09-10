import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, existsSync, statSync } from 'node:fs';
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
// Publication takes Markdown pages whose sources are bare patterns. These tests were written
// against the JSON patch it replaced, so the shape is translated here rather than at every call site.
function drafts(input: any) {
  return (input.pages ?? []).map((page: any) => ({ path: page.path, body: page.body,
    meta: { ...page.meta, sources: (page.meta.sources ?? []).map((s: any) => typeof s === "string" ? s : s.id) } }));
}
function publish(wiki: Wiki, input: any, ref?: string) { return wiki.publishPages(drafts(input), ref ?? input.revision); }
function patch(sources: any[]) { return { pages: [{ path: 'concepts/retries.md', meta: { type: 'concept', title: 'Retries', description: 'Retry policy',
  sources: sources.map(({ content, ...source }: any) => source), wikipoke: { uid: 'retries', relations: [] } }, body: 'Requests use three retries.' }], findings: [] }; }

test('ingest plans deterministic work and publish validates source evidence', async () => {
  const wiki = await setup();
  assert.deepEqual((await wiki.status()).uncovered, ['src/main.ts']);
  await publish(wiki, patch((await wiki.ingest() as any).sources));
  const page = readFileSync(join(wiki.root, 'wiki/concepts/retries.md'), 'utf8');
  assert.equal((await wiki.ingest() as any).complete, true);
  assert.equal(readFileSync(join(wiki.root, 'wiki/concepts/retries.md'), 'utf8'), page);
  assert.deepEqual((await wiki.status()).uncovered, []);
  writeFileSync(join(wiki.root, 'src/main.ts'), 'export const retries = 4;');
  git(wiki.root, 'add', 'src'); git(wiki.root, 'commit', '-qm', 'change');
  assert.equal((await wiki.status()).drift[0].source, 'src/main.ts');
  await publish(wiki, patch((await wiki.ingest() as any).sources)); assert.deepEqual((await wiki.status()).drift, []);
});

test('ingest reopens changed coverage and completes only after reconciliation', async () => {
  const wiki = await setup();
  await publish(wiki, patch((await wiki.ingest()).sources));
  writeFileSync(join(wiki.root, 'src/main.ts'), 'export const retries = 8;\n');
  git(wiki.root, 'add', 'src'); git(wiki.root, 'commit', '-qm', 'change');
  const plan = await wiki.ingest();
  assert.equal(plan.complete, false);
  assert.deepEqual(plan.sources.map(s => s.id), ['src/main.ts']);
  assert.match(plan.sources[0].content, /8/);
  assert.deepEqual(plan.pages.map(p => p.path), ['concepts/retries.md']);
  assert.equal(plan.drift[0].reason, 'changed');
  await publish(wiki, patch(plan.sources), plan.revision);
  assert.equal((await wiki.ingest()).complete, true);
  await wiki.seal();
});

test('a deleted source remains actionable even with an empty batch', async () => {
  const wiki = await setup();
  await publish(wiki, patch((await wiki.ingest()).sources));
  git(wiki.root, 'rm', 'src/main.ts'); git(wiki.root, 'commit', '-qm', 'remove');
  const plan = await wiki.ingest();
  assert.equal(plan.complete, false);
  assert.equal(plan.sources.length, 0);
  assert.equal(plan.drift[0].reason, 'missing');
  assert.equal(plan.pages[0].path, 'concepts/retries.md');
  await publish(wiki, patch([]));
  assert.equal((await wiki.ingest()).complete, true);
});

test('historical evidence drift requests review without rewriting the record', async () => {
  const wiki = await setup();
  await wiki.capture({ id: 'historical', task: 'policy', actor: 'test', kind: 'decision',
    at: '2026-09-10T10:00:00Z', choice: 'Use three retries.', evidence: ['src/main.ts'] });
  await publish(wiki, patch((await wiki.ingest()).sources));
  writeFileSync(join(wiki.root, 'src/main.ts'), 'export const retries = 8;\n');
  git(wiki.root, 'add', 'src'); git(wiki.root, 'commit', '-qm', 'change');
  await publish(wiki, patch((await wiki.ingest()).sources));
  const plan = await wiki.ingest();
  assert.equal(plan.complete, false);
  assert.equal(plan.sources.length, 0);
  assert.equal(plan.reviewRequired.length, 1);
  assert.match(wiki.pages().find(p => p.meta.type === 'decision')!.body, /three retries/);
});

test('quality checks resolve and deduplicate patterns in drafts and published pages', async () => {
  const wiki = await setup();
  for (let n = 0; n < 4; n++) writeFileSync(join(wiki.root, `src/m${n}.ts`), `export const n = ${n};\n`);
  git(wiki.root, 'add', 'src'); git(wiki.root, 'commit', '-qm', 'module');
  const draft = { path: 'flows/request.md', meta: { type: 'flow', title: 'Request',
    sources: ['src', 'src/**', 'src/main.ts'] }, body: 'Short.' };
  const check = await wiki.lintPages([draft] as any);
  assert.match(check.findings.find(f => f.code === 'thin-coverage')!.message, /Claims 5 sources/);
  await wiki.publishPages([draft] as any);
  assert.equal((await wiki.ingest()).complete, false);
  assert.equal((await wiki.ingest()).sources.length, 0);
  assert.equal((await wiki.lint()).some(f => f.code === 'thin-coverage'), true);
  await assert.rejects(wiki.seal(), /claim more sources/);
  await wiki.publishPages([{ ...draft, meta: { ...draft.meta, sources: ['src'] },
    body: 'The request enters the handler, validates its input, reads the configured retry limit, then executes the operation. Failures retry until the limit is exhausted and return an error.' }] as any);
  assert.equal((await wiki.lint()).some(f => f.code === 'thin-flow'), false);
  assert.equal((await wiki.ingest()).complete, true);
});

test('queries persist before agent research and deduplicate request IDs', async () => {
  const wiki = await setup();
  await wiki.ask('How many retries?', 'request-1');
  await wiki.ask('How many retries?', 'request-1');
  assert.equal(wiki.pages().length, 1);
  await wiki.answer('request-1', { answer: 'Three retries.', citations: ['src/main.ts'], gaps: [] });
  await assert.rejects(wiki.ask('Different?', 'request-1'), /already used/);
});

test('the same question already answered comes back instead of being researched twice', async () => {
  const wiki = await setup();
  await wiki.ask('How many retries?', 'first');
  await wiki.answer('first', { answer: 'Three retries.', citations: ['src/main.ts'], gaps: [] });

  // Same question, different wording of the punctuation, new request id: no second page.
  const again: any = await wiki.ask('How many retries', 'second');
  assert.equal(again.reused, true);
  assert.equal(again.requestId, 'first');
  assert.match(again.answer, /Three retries/);
  assert.equal(wiki.pages().length, 1);

  // Asking for it anyway is one flag, because revising a closed answer is a real need.
  await wiki.ask('How many retries?', 'third', undefined, true);
  assert.equal(wiki.pages().length, 2);

  // And once the cited code moves, the old answer is no longer evidence of anything.
  writeFileSync(join(wiki.root, 'src/main.ts'), 'export const retries = 9;\n');
  git(wiki.root, 'add', 'src'); git(wiki.root, 'commit', '-qm', 'change');
  const stale: any = await wiki.ask('How many retries?', 'fourth');
  assert.equal(stale.reused, undefined);
  assert.equal(stale.state, 'pending');
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
  assert.equal(query.answer, undefined, 'the prose lives in the body, never twice in one file');
  assert.deepEqual(query.gaps, ['No source states it']);
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
  await assert.rejects(publish(wiki, outside), /outside scope/);
  mkdirSync(join(wiki.root, 'wiki/concepts'), { recursive: true });
  writeFileSync(join(wiki.root, 'wiki/concepts/retries.md'), '---\ntype: concept\ntitle: Human\nwikipoke:\n  uid: human\n---\nhuman edit\n');
  await assert.rejects(publish(wiki, patch(plan.sources)), /(Concurrent edit|identity)/);
  assert.match(read(join(wiki.root, 'wiki/concepts/retries.md'))!, /human edit/);
  symlinkSync(tmpdir(), join(wiki.root, 'wiki/escape'));
  assert.throws(() => wiki.store.path('wiki/escape/a.md'), /Symlink/);
});

test('seal records a checkpoint only after coverage and drift are clear', async () => {
  const wiki = await setup();
  await assert.rejects(wiki.seal(), /pending work: 1 uncovered source/);
  await publish(wiki, patch((await wiki.ingest() as any).sources));
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
  assert.ok(wiki.pages().some(page => page.path === 'queries/how-many-retries.md'));
  assert.ok(wiki.pages().some(page => page.path === 'decisions/use-bounded-retries.md'));
});

test('a name already taken gets a number, and a published page never gets renamed', async () => {
  const wiki = await setup();
  const base = { task: 'retries', actor: 'agent/test', at: '2026-09-09T10:00:00Z', kind: 'decision' as const };
  // A choice is a paragraph; without a title the first sentence names the page.
  await wiki.capture({ ...base, id: 'one', choice: 'Bound the retries. The tail latency is what matters here, and it is measured.' });
  assert.ok(wiki.pages().some(page => page.path === 'decisions/bound-the-retries.md'));
  await wiki.capture({ ...base, id: 'two', choice: 'Bound the retries. A second, unrelated choice that happens to open the same way.' });
  const paths = wiki.pages().map(page => page.path).sort();
  assert.deepEqual(paths.filter(p => p.startsWith('decisions/')),
    ['decisions/bound-the-retries-2.md', 'decisions/bound-the-retries.md']);
  // Capturing again resolves both by uid, so neither page moves.
  await wiki.capture({ ...base, id: 'three', title: 'Jitter the backoff', choice: 'Add jitter.' });
  assert.deepEqual(wiki.pages().map(page => page.path).sort().filter(p => p.startsWith('decisions/')),
    ['decisions/bound-the-retries-2.md', 'decisions/bound-the-retries.md', 'decisions/jitter-the-backoff.md']);
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
  await publish(wiki, patch((await wiki.ingest() as any).sources));
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
  await publish(wiki, { revision: plan.revision, findings: [], pages: [{ path: 'concepts/retries.md',
    meta: { type: 'concept', title: 'Retries', description: 'Retry policy', sources: plan.sources,
      wikipoke: { uid: 'retries', relations: [] } }, body: 'Requests use three retries.' }] });
  const page = readFileSync(join(wiki.root, 'wiki/concepts/retries.md'), 'utf8');
  assert.equal(page.includes('export const retries'), false);
  // With a Git adapter the resource is the id, so the plan never offers a field that only repeats
  // one - and publish drops it even when an agent fills it in from the schema anyway.
  assert.deepEqual(Object.keys(wiki.pages()[0].meta.sources[0]).sort(), ['hash', 'id', 'revision']);
  const echoed_ = wiki.pages()[0].meta.sources.map(source => ({ ...source, resource: source.id }));
  await publish(wiki, { revision: plan.revision, findings: [], pages: [{ path: 'concepts/echo.md',
    meta: { type: 'concept', title: 'Echo', description: 'Echo', wikipoke: { uid: 'echo', relations: [] },
      sources: echoed_ }, body: 'Body.' }] });
  const echoed = wiki.pages().find(page => page.path === 'concepts/echo.md')!;
  assert.deepEqual(Object.keys(echoed.meta.sources[0] ?? {}).sort(), ['hash', 'id', 'revision']);
  // Including the pages Wikipoke generates itself, which took their sources straight from the
  // inventory and so carried the same duplication in through a different door.
  await wiki.ask('How many retries?', 'norm');
  await wiki.answer('norm', { answer: 'Three.', citations: ['src/main.ts'], gaps: [] });
  const query = wiki.pages().find(page => page.meta.type === 'query')!;
  assert.deepEqual(Object.keys(query.meta.sources[0]).sort(), ['hash', 'id', 'revision']);
});

test('publish refuses a patch whose evidence moved, and only that', async () => {
  const wiki = await setup();
  const plan: any = await wiki.ingest();
  // Somebody commits something else entirely while the agent is writing. The cited source did not
  // move, so the work stands: rejecting it here threw away a whole batch for a typo in a README.
  writeFileSync(join(wiki.root, 'src/extra.ts'), 'export const extra = 1;\n');
  git(wiki.root, 'add', '.'); git(wiki.root, 'commit', '-qm', 'extra');
  await publish(wiki, { ...patch(plan.sources), revision: plan.revision });
  assert.deepEqual((await wiki.status()).uncovered, ['src/extra.ts']);

  // The cited source itself moving is a different matter: the page was written against content that
  // no longer exists. One diff against the commit the plan was made at settles it, so nothing has to
  // be transcribed into the page for the check to have something to compare.
  const stale: any = await wiki.ingest();
  writeFileSync(join(wiki.root, 'src/main.ts'), 'export const retries = 99;\n');
  git(wiki.root, 'add', '.'); git(wiki.root, 'commit', '-qm', 'moved');
  await assert.rejects(publish(wiki, { pages: [{ path: 'concepts/moved.md',
    meta: { type: 'concept', title: 'Moved', description: 'Moved', sources: ['src/main.ts'],
      wikipoke: { uid: 'moved', relations: [] } }, body: 'Body.' }] }, stale.revision),
    /moved after planning: src\/main\.ts/);
});

test('one page covers a module, and a file appearing under it moves the page', async () => {
  const wiki = await setup();
  writeFileSync(join(wiki.root, 'src/queue.ts'), 'export const queue = [];\n');
  git(wiki.root, 'add', '.'); git(wiki.root, 'commit', '-qm', 'second source');
  // Two files, one pattern, one page. This is the whole point: coverage is reached by writing about
  // a module, not by writing a page per file and passing every mechanical check while saying nothing.
  await publish(wiki, { pages: [{ path: 'concepts/src.md', meta: { type: 'entity', title: 'The src module',
    description: 'What src does', sources: ['src'] }, body: 'Retries and a queue.' }] });
  assert.deepEqual((await wiki.status()).uncovered, []);
  assert.deepEqual((await wiki.status()).drift, []);
  // Identity is assigned, not transcribed: the page keeps the uid Wikipoke gave it on first publication.
  assert.equal(wiki.pages()[0].meta.wikipoke.uid, 'concepts-src');
  assert.deepEqual(wiki.pages()[0].meta.sources.map(s => s.id), ['src']);
  // A new file under the pattern is covered the moment it lands - and the page that claims it has
  // gone stale, which is the signal that actually needs a human or an agent to act.
  writeFileSync(join(wiki.root, 'src/retry.ts'), 'export const retry = true;\n');
  git(wiki.root, 'add', '.'); git(wiki.root, 'commit', '-qm', 'third source');
  const status: any = await wiki.status();
  assert.deepEqual(status.uncovered, []);
  assert.deepEqual(status.drift.map((d: any) => [d.source, d.reason]), [['src', 'changed']]);
});

test('a plan can be aimed at a part of the repository that never changed', async () => {
  const wiki = await setup();
  mkdirSync(join(wiki.root, 'src/api'));
  writeFileSync(join(wiki.root, 'src/api/routes.ts'), 'export const routes = [];\n');
  git(wiki.root, 'add', '.'); git(wiki.root, 'commit', '-qm', 'api');
  const aimed: any = await wiki.ingest('HEAD', 'src/api');
  assert.deepEqual(aimed.sources.map((s: any) => s.id), ['src/api/routes.ts']);
  // The aim says what is left here; `complete` and `remaining` keep speaking for the whole scope,
  // so a loop driven by them does not stop with most of the repository still undocumented.
  assert.equal(aimed.remainingHere, 0);
  assert.equal(aimed.complete, false);
  assert.equal(aimed.remaining, 1);
  await assert.rejects(wiki.ingest('HEAD', 'src/nothing'), /Nothing in scope matches/);
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
  // What the pass pruned is about this run, not part of the signal a session reads back.
  const { pruned, ...written } = signal as any;
  assert.deepEqual(pruned, { archived: 0 });
  // The signal is what a session reads at startup and at the end of a turn, so it stays the bounded
  // health of the wiki against the code - never a transcript of what an agent did.
  assert.deepEqual(Object.keys(written).sort(),
    ['at', 'checkpoint', 'drift', 'findings', 'flows', 'pages', 'revision', 'uncommitted', 'uncovered']);
  assert.deepEqual(JSON.parse(read(join(wiki.root, '.wikipoke/attention.json'))!), written);
  await publish(wiki, patch((await wiki.ingest() as any).sources));
  assert.deepEqual((await wiki.graph()).nodes.map(n => n.id), wiki.pages().map(p => p.path));
});

test('a page published under a nested index name stays visible to the wiki', async () => {
  const wiki = await setup();
  const plan: any = await wiki.ingest(), sources = plan.sources.map(({ content, ...s }: any) => s);
  const page = (path: string, uid: string) => ({ path, meta: { type: 'concept', title: uid, description: uid,
    sources, wikipoke: { uid, relations: [] } }, body: 'Text.' });
  const result: any = await publish(wiki, { revision: plan.revision, findings: [],
    pages: [page('entities/index.md', 'entities-index'), page('entities/real.md', 'real')] });
  assert.deepEqual(result.published, ['entities/index.md', 'entities/real.md']);
  const status = await wiki.status();
  assert.equal(status.pages, 2);
  assert.deepEqual(status.findings.filter(f => f.code === 'invalid-page'), []);
  assert.deepEqual((await wiki.graph()).nodes.map(n => n.id), ['entities/index.md', 'entities/real.md']);
  assert.match(read(join(wiki.root, 'wiki/index.md'))!, /\(entities\/index\.md\)/);
  assert.equal(wiki.pages().some(p => p.path === 'index.md'), false);
  await assert.rejects(publish(wiki, { ...patch(plan.sources), pages: [page('index.md', 'root')] }), /Invalid concept path/);
});

test('publishing over an unreadable page names the real cause', async () => {
  const wiki = await setup();
  const plan: any = await wiki.ingest(), notes = join(wiki.root, 'wiki/concepts/retries.md');
  mkdirSync(join(wiki.root, 'wiki/concepts'), { recursive: true });
  writeFileSync(notes, 'Human notes without frontmatter\n');
  await assert.rejects(publish(wiki, patch(plan.sources)),
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
    rationale: 'Documentation-only task; nobody stated a choice.', evidence: ['src/main.ts'] });
  assert.equal(closed.materialized, false);
  assert.equal(wiki.pages().length, 0);
  // The tape is durable even though nothing was published.
  assert.equal(wiki.events().filter(event => event.task === base.task).length, 2);

  const recorded: any = await wiki.capture({ ...base, id: 'e3', kind: 'decision',
    choice: 'The registry stays a plain map', rationale: 'A map keeps the bundle tree-shakeable.' });
  assert.equal(recorded.materialized, true);
  const decision = wiki.pages().find(page => page.meta.type === 'decision')!;
  assert.match(decision.body, /The registry stays a plain map/);
  assert.match(decision.body, /A map keeps the bundle tree-shakeable/);
});

test('capture publishes the choice, never a transcript of the task', async () => {
  const wiki = await setup();
  await publish(wiki, patch((await wiki.ingest() as any).sources));
  const base = { task: 'pick a retry count', actor: 'agent/test', at: '2026-09-09T10:00:00Z' };
  await wiki.capture({ ...base, id: 'd0', kind: 'open' });
  await wiki.capture({ ...base, id: 'd1', kind: 'decision', choice: 'Three retries', rationale: 'Measured tail latency.' });
  // The open event is on the tape and nowhere in the wiki: no page restates "Task opened".
  assert.equal(wiki.pages().every(page => !/Task opened/.test(page.body)), true);
  assert.equal(existsSync(join(wiki.root, 'wiki/watchlogs')), false);
  const written = readFileSync(join(wiki.root, 'wiki/index.md'), 'utf8');
  assert.match(written, /concepts\/retries\.md/);
  assert.match(written, /decisions\//);
});

test('asking again offers the answers already given instead of hiding them', async () => {
  const wiki = await setup();
  await wiki.ask('How many retries does the client make?', 'first');
  await wiki.answer('first', { answer: 'Three retries.', citations: ['src/main.ts'], gaps: [] });
  const repeated: any = await wiki.ask('How many retries are configured?', 'second');
  assert.deepEqual(repeated.priorAnswers.map((prior: any) => prior.requestId), ['first']);
  assert.equal(repeated.priorAnswers[0].question, 'How many retries does the client make?');
  const unrelated: any = await wiki.ask('Which theme tokens exist?', 'third');
  assert.deepEqual(unrelated.priorAnswers, []);
  // A question still pending is not an answer, so it is never offered as one.
  const pending: any = await wiki.ask('How many retries are configured now?', 'fourth');
  assert.deepEqual(pending.priorAnswers.map((prior: any) => prior.requestId), ['first']);
});

test('the generated log carries the chronology of the code, newest first', async () => {
  const wiki = await setup();
  const base = { task: 'retry policy', actor: 'agent/test' };
  await wiki.capture({ ...base, id: 'l1', kind: 'decision', at: '2026-09-09T10:00:00Z',
    choice: 'Three retries', rationale: 'Measured tail latency.', evidence: ['src/main.ts'] });
  await wiki.capture({ ...base, id: 'l2', kind: 'decision', at: '2026-09-09T12:00:00Z',
    choice: 'Jitter the backoff', rationale: 'Synchronized retries stampede.', evidence: ['src/main.ts'] });
  const log = readFileSync(join(wiki.root, 'wiki/log.md'), 'utf8');
  assert.ok(log.indexOf('Jitter the backoff') < log.indexOf('Three retries'));
  assert.match(log, /Touched: `src\/main\.ts`/);
  // The log is chronology, not knowledge: the index never lists it.
  assert.doesNotMatch(readFileSync(join(wiki.root, 'wiki/index.md'), 'utf8'), /log\.md/);
});

test('lint names the flow a file-by-file wiki never notices is missing', async () => {
  const wiki = await setup();
  writeFileSync(join(wiki.root, 'src/other.ts'), 'export const backoff = 250;\n');
  git(wiki.root, 'add', 'src'); git(wiki.root, 'commit', '-qm', 'second source');
  const sources = (await wiki.ingest() as any).sources.map(({ content, ...source }: any) => source);
  const page = (path: string, type: string, cited: any[]) => ({ path, meta: { type, title: path,
    description: path, sources: cited, wikipoke: { uid: path, relations: [] } }, body: 'Body.' });
  await publish(wiki, { pages: [page('a.md', 'entity', sources), page('b.md', 'entity', []),
    page('c.md', 'entity', [])], findings: [] });
  // Every source is claimed and coverage reads green, which is exactly when the gap is invisible.
  assert.deepEqual((await wiki.status()).uncovered, []);
  assert.equal((await wiki.lint()).some(f => f.code === 'no-flows'), true);

  await publish(wiki, { pages: [page('flows/thin.md', 'flow', sources.slice(0, 1))], findings: [] });
  assert.equal((await wiki.lint()).some(f => f.code === 'no-flows'), false);
  // A flow resting on one file is an entity wearing the wrong type.
  assert.equal((await wiki.lint()).some(f => f.code === 'thin-flow'), true);
  await publish(wiki, { pages: [page('flows/whole.md', 'flow', sources)], findings: [] });
  assert.equal((await wiki.lint()).filter(f => f.code === 'thin-flow').length, 1);
});

test('a wiki written with full-length digests is not reported as drifted after an upgrade', async () => {
  const wiki = await setup();
  const plan: any = await wiki.ingest();
  // What an earlier release wrote: the whole SHA-256 and the whole commit, plus the resource it
  // always repeated. Every one of those pages is still on disk in real projects.
  const legacy = plan.sources.map((source: any) => ({ id: source.id, resource: source.id,
    revision: git(wiki.root, 'rev-parse', 'HEAD'), hash: hash(readFileSync(join(wiki.root, source.id), 'utf8')) }));
  await publish(wiki, { revision: plan.revision, findings: [], pages: [{ path: 'concepts/retries.md',
    meta: { type: 'concept', title: 'Retries', description: 'Retry policy', sources: legacy,
      wikipoke: { uid: 'retries', relations: [] } }, body: 'Requests use three retries.' }] });
  const status: any = await wiki.status();
  assert.deepEqual(status.drift, []);
  assert.deepEqual(status.uncovered, []);
  // And it still notices a real change, rather than accepting any prefix as proof of anything.
  writeFileSync(join(wiki.root, 'src/main.ts'), 'export const retries = 9;\n');
  git(wiki.root, 'add', 'src'); git(wiki.root, 'commit', '-qm', 'change');
  assert.equal((await wiki.status()).drift.length, 1);
});

test('a decision joins the graph through the code it was about', async () => {
  const wiki = await setup();
  await publish(wiki, patch((await wiki.ingest() as any).sources));
  await wiki.capture({ id: 'g1', task: 'retry policy', actor: 'agent/test', at: '2026-09-09T10:00:00Z',
    kind: 'decision', title: 'Three retries', choice: 'Bound the retries at three.',
    rationale: 'Measured at p99.', evidence: ['src/main.ts', 'src/deleted.ts'] });
  const page = wiki.pages().find(p => p.meta.type === 'decision')!;
  // Declared evidence resolved against the inventory becomes real provenance, pinned at this hash.
  assert.deepEqual(page.meta.sources.map(s => s.id), ['src/main.ts']);
  // What is out of scope is not silently dropped; it stays declared in the body, unverified.
  assert.match(page.body, /Declared evidence not in scope[\s\S]*src\/deleted\.ts/);
  const edges = (await wiki.graph()).edges;
  assert.equal(edges.some(e => e.type === 'source' && e.from === page.path && e.to === 'src/main.ts'), true);
  // The connection is a link a reader can follow, not a typed relation only a graph command sees.
  assert.deepEqual(page.meta.wikipoke.relations, []);
  assert.match(page.body, /# Documented here\n\n- \[retries\]\(\.\.\/concepts\/retries\.md\)/);
  assert.equal(edges.some(e => e.type === 'links_to' && e.from === page.path && e.to === 'concepts/retries.md'), true);

  // A second choice under the same task links to the first, and the first back to it.
  await wiki.capture({ id: 'g2', task: 'retry policy', actor: 'agent/test', at: '2026-09-09T11:00:00Z',
    kind: 'decision', title: 'Jitter the backoff', choice: 'Jitter it.', evidence: ['src/main.ts'] });
  const both = (await wiki.graph()).edges.filter(e => e.type === 'links_to'
    && e.from.startsWith('decisions/') && e.to.startsWith('decisions/'));
  assert.equal(both.length, 2);
  assert.equal((await wiki.status()).uncovered.length, 0);
});

test('an answer can cite a page, and the query is connected to what answered it', async () => {
  const wiki = await setup();
  await publish(wiki, patch((await wiki.ingest() as any).sources));
  await wiki.ask('How many retries?', 'cited');
  await wiki.answer('cited', { answer: 'Three.', citations: ['src/main.ts', 'concepts/retries.md'], gaps: [] });
  const query = wiki.pages().find(p => p.meta.type === 'query')!;
  assert.deepEqual(query.meta.sources.map(s => s.id), ['src/main.ts']);
  assert.match(query.body, /# Answered from\n\n- \[retries\]\(\.\.\/concepts\/retries\.md\)/);
  const edges = (await wiki.graph()).edges.filter(e => e.from === query.path);
  assert.equal(edges.some(e => e.type === 'links_to' && e.to === 'concepts/retries.md'), true);
  await wiki.ask('Anything else?', 'bad');
  await assert.rejects(wiki.answer('bad', { answer: 'x', citations: ['concepts/nope.md'], gaps: [] }),
    /Unknown citation: concepts\/nope\.md/);
});

test('the graph says which relations are symmetric and stops repeating itself', async () => {
  const wiki = await setup();
  const plan: any = await wiki.ingest();
  const sources = plan.sources.map(({ content, ...source }: any) => source);
  const page = (path: string, relations: any[]) => ({ path, meta: { type: 'entity', title: path,
    description: path, sources, wikipoke: { uid: path, relations } }, body: 'Body.' });
  await publish(wiki, { revision: plan.revision, findings: [], pages: [
    page('a.md', [{ type: 'related_to', target: '/b.md' }, { type: 'depends_on', target: '/b.md' }]),
    page('b.md', [{ type: 'related_to', target: '/a.md' }, { type: 'depends_on', target: '/a.md' }]),
  ] });
  const result: any = await wiki.graph();
  // Declared, so a reader can tell "no reciprocal pair" from "recorded in one direction only".
  assert.deepEqual(result.symmetric, ['related_to']);
  assert.equal(result.edges.filter((e: any) => e.type === 'related_to').length, 1);
  // A provenance edge points at its own evidence, so it no longer restates it.
  assert.deepEqual(result.edges.find((e: any) => e.type === 'source').evidence, []);
  // The dependency really is circular, and saying so is the wiki's job.
  const findings = await wiki.lint();
  assert.equal(findings.filter(f => f.code === 'dependency-cycle').length, 2);
  assert.equal(findings.every(f => f.code !== 'replacement-cycle'), true);
});

test('a wikilink in the body is an edge, and brackets in code are not', async () => {
  const wiki = await setup();
  const plan: any = await wiki.ingest();
  const sources = plan.sources.map(({ content, ...source }: any) => source);
  const page = (path: string, body: string) => ({ path, meta: { type: 'entity', title: path,
    description: path, sources, wikipoke: { uid: path, relations: [] } }, body });
  await publish(wiki, { revision: plan.revision, findings: [], pages: [
    page('concepts/retries.md', 'Bounded, see [[concepts/backoff]] and [[concepts/backoff|the backoff]].\n\n`const x = a[[0]]`\n'),
    page('concepts/backoff.md', 'Jittered.'),
  ] });
  const edges = (await wiki.graph()).edges.filter(e => e.type === 'links_to');
  assert.deepEqual(edges.map(e => e.to), ['concepts/backoff.md']);
  // The bracket pair inside inline code is code, not a link to a page called "0".
  assert.equal(edges.some(e => /0/.test(e.to)), false);
  assert.deepEqual((await wiki.lint()).filter(f => f.code === 'broken-link'), []);
});

test('a wiki with no flow through it cannot be sealed as complete', async () => {
  const wiki = await setup();
  writeFileSync(join(wiki.root, 'src/other.ts'), 'export const backoff = 250;\n');
  git(wiki.root, 'add', 'src'); git(wiki.root, 'commit', '-qm', 'second source');
  const sources = (await wiki.ingest() as any).sources.map(({ content, ...source }: any) => source);
  const page = (path: string, type: string, cited: any[]) => ({ path, meta: { type, title: path,
    description: path, sources: cited, wikipoke: { uid: path, relations: [] } }, body: 'Body.' });
  await publish(wiki, { pages: [page('a.md', 'entity', sources), page('b.md', 'entity', []),
    page('c.md', 'entity', [])], findings: [] });
  // Coverage is clean and every finding is a warning, which used to be enough to certify the wiki.
  assert.deepEqual((await wiki.status()).uncovered, []);
  await assert.rejects(wiki.seal(), /no page describes a flow/);
  await publish(wiki, { pages: [page('flows/one.md', 'flow', sources)], findings: [] });
  assert.ok((await wiki.seal() as any).lastIndexedCommit);
});

test('a checkpoint that is no longer in the repository is reported, not read as clean', async () => {
  const wiki = await setup();
  await publish(wiki, patch((await wiki.ingest() as any).sources));
  const flows = { path: 'flows/one.md', meta: { type: 'flow', title: 'Flow', description: 'Flow',
    sources: (await wiki.ingest() as any).sources.map(({ content, ...s }: any) => s),
    wikipoke: { uid: 'flow', relations: [] } }, body: 'Body.' };
  await publish(wiki, { pages: [flows], findings: [] });
  await wiki.seal();
  // What a squash-merge leaves behind: state.json names a commit this repository does not have.
  writeFileSync(join(wiki.root, '.wikipoke/state.json'),
    JSON.stringify({ version: 1, lastIndexedCommit: '0'.repeat(40), sealedAt: '2026-09-09T10:00:00Z' }));
  const status: any = await wiki.status();
  assert.equal(status.findings.some((f: any) => f.code === 'lost-checkpoint'), true);
  // And it holds the next seal instead of certifying over a comparison that never ran.
  await assert.rejects(wiki.seal(), /error finding/);
});

test('what the wiki writes is readable by anyone who can read the repository', async () => {
  const wiki = await setup();
  await publish(wiki, patch((await wiki.ingest() as any).sources));
  for (const file of ['wikipoke.config.yaml', 'wiki/index.md', 'wiki/concepts/retries.md']) {
    const mode = statSync(join(wiki.root, file)).mode & 0o777;
    // Owner-only made the wiki unreadable to CI, or to anyone in a container under another uid,
    // for content whose whole purpose is to be shared and versioned.
    assert.equal((mode & 0o044) !== 0, true, `${file} is ${mode.toString(8)}`);
  }
});

test('a page git filled with conflict markers is repairable by the agent that can read both sides', async () => {
  const wiki = await setup();
  await publish(wiki, patch((await wiki.ingest() as any).sources));
  const page = join(wiki.root, 'wiki/concepts/retries.md');
  writeFileSync(page, '<<<<<<< HEAD\n---\ntype: concept\n=======\n---\ntype: concept\n>>>>>>> other\n');
  const findings = await wiki.lint();
  // Not "Implicit keys need to be on a single line at line 2", which tells nobody anything.
  assert.equal(findings.some(f => f.code === 'conflict-markers'), true);
  assert.match(findings.find(f => f.code === 'conflict-markers')!.message, /merge conflict/);
  // And the agent can fix it, instead of a human editing YAML by hand.
  await publish(wiki, patch((await wiki.ingest() as any).sources));
  assert.deepEqual(await wiki.lint(), []);
});

test('drift names the way out, including when the file is simply gone', async () => {
  const wiki = await setup();
  await publish(wiki, patch((await wiki.ingest() as any).sources));
  git(wiki.root, 'rm', '-q', 'src/main.ts'); git(wiki.root, 'commit', '-qm', 'remove');
  const [gone]: any = (await wiki.status()).drift;
  assert.equal(gone.reason, 'missing');
  assert.match(gone.remedy, /republish concepts\/retries\.md without that source/);
  // Which is a real way out: the page stays as the record that this module existed.
  await publish(wiki, { pages: [{ path: 'concepts/retries.md', meta: { type: 'concept',
    title: 'Retries', description: 'Retry policy', sources: [], wikipoke: { uid: 'retries', relations: [] } },
    body: 'The retry module was removed.' }], findings: [] });
  assert.deepEqual((await wiki.status()).drift, []);
});

test('one sentence citing everything does not buy a covered wiki', async () => {
  const wiki = await setup();
  for (const n of [1, 2, 3]) writeFileSync(join(wiki.root, `src/m${n}.ts`), `export const v${n} = ${n};\n`);
  git(wiki.root, 'add', 'src'); git(wiki.root, 'commit', '-qm', 'more');
  const plan: any = await wiki.ingest();
  // The whole repository claimed by one page with one sentence: the shape of the shortcut.
  await publish(wiki, { revision: plan.revision, findings: [], pages: [{ path: 'concepts/all.md',
    meta: { type: 'concept', title: 'Everything', description: 'Everything',
      sources: plan.sources.map(({ content, ...source }: any) => source),
      wikipoke: { uid: 'all', relations: [] } }, body: 'This project contains source files.' }] });
  const status: any = await wiki.status();
  assert.deepEqual(status.uncovered, []);
  assert.equal(status.findings.some((f: any) => f.code === 'thin-coverage'), true);
  // Coverage still reads clean, and the checkpoint no longer certifies it.
  await assert.rejects(wiki.seal(), /claim more sources than they describe/);
});

test('a plan says when it describes code the working tree has already moved past', async () => {
  const wiki = await setup();
  assert.deepEqual((await wiki.ingest() as any).uncommitted, []);
  writeFileSync(join(wiki.root, 'src/main.ts'), 'export const retries = 4;\n');
  const plan: any = await wiki.ingest();
  // The inventory reads the committed tree, so this plan carries retries = 3 while the disk says 4.
  assert.deepEqual(plan.uncommitted, ['src/main.ts']);
  assert.match(plan.warning, /uncommitted changes/);
  assert.match(plan.sources[0].content, /retries = 3/);
  // A file outside the configured scope is nobody's business here.
  writeFileSync(join(wiki.root, 'README.md'), '# Notes\n');
  assert.deepEqual((await wiki.ingest() as any).uncommitted, ['src/main.ts']);
});

test('a wiki shaped like the file tree is reported, and a wiki of knowledge is not', async () => {
  const wiki = await setup();
  for (let n = 0; n < 40; n++) writeFileSync(join(wiki.root, `src/m${n}.ts`), `export const v${n} = ${n};\n`);
  git(wiki.root, 'add', 'src'); git(wiki.root, 'commit', '-qm', 'many');
  const plan: any = await wiki.ingest();
  const page = (path: string, cited: any[], body: string) => ({ path, meta: { type: 'entity',
    title: path, description: path, sources: cited, wikipoke: { uid: path, relations: [] } }, body });

  // One page per file, named after the path: every source claimed, every other check green.
  const sources = plan.sources.map(({ content, ...source }: any) => source);
  await publish(wiki, { revision: plan.revision, findings: [], pages: sources.map((source: any) =>
    page(`${source.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`, [source],
      'This module exports a constant used elsewhere in the project.')) });
  let more: any = await wiki.ingest();
  while (more.sources.length) {
    await publish(wiki, { revision: more.revision, findings: [], pages: more.sources.map((source: any) => {
      const { content, ...rest } = source;
      return page(`${source.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`, [rest],
        'This module exports a constant used elsewhere in the project.');
    }) });
    more = await wiki.ingest();
  }
  const mirrored: any = await wiki.status();
  assert.deepEqual(mirrored.uncovered, []);
  assert.equal(mirrored.findings.some((f: any) => f.code === 'mirrors-the-tree'), true);
});

test('maintenance keeps the tape from growing without bound, and loses nothing', async () => {
  const wiki = await setup();
  const base = { task: 'retry policy', actor: 'agent/test' };
  writeFileSync(join(wiki.root, 'src/other.ts'), 'export const backoff = 250;\n');
  git(wiki.root, 'add', 'src'); git(wiki.root, 'commit', '-qm', 'second source');
  await wiki.capture({ ...base, id: 'p1', kind: 'open', at: '2026-09-09T09:00:00Z' });
  await wiki.capture({ ...base, id: 'p2', kind: 'decision', at: '2026-09-09T10:00:00Z',
    title: 'Three retries', choice: 'Bound them.', evidence: ['src/main.ts'] });
  await wiki.capture({ ...base, id: 'p3', kind: 'close', at: '2026-09-09T11:00:00Z', closure: 'recorded' });
  await wiki.capture({ id: 'p4', task: 'still open', actor: 'agent/test', at: '2026-09-09T12:00:00Z', kind: 'open' });

  const before = wiki.events().length;
  const pruned: any = (await wiki.attention() as any).pruned;
  // A closed, materialized task folds into one file per month. A task still in flight does not move.
  assert.equal(pruned.archived, 3);
  assert.equal(existsSync(join(wiki.root, '.wikipoke/events/archive/2026-09.jsonl')), true);
  assert.equal(wiki.events().length, before);
  assert.deepEqual(wiki.events().map(e => e.id), ['p1', 'p2', 'p3', 'p4']);
});

test('a plan carries the content of its batch and nothing else', async () => {
  const wiki = await setup();
  for (let n = 0; n < 12; n++) writeFileSync(join(wiki.root, `src/m${n}.ts`), `export const v${n} = ${n};\n`);
  git(wiki.root, 'add', 'src'); git(wiki.root, 'commit', '-qm', 'many');
  const plan: any = await wiki.ingest();
  // Batch size is the limit, and every source in it arrives readable.
  assert.equal(plan.sources.length, 5);
  assert.equal(plan.sources.every((s: any) => typeof s.content === 'string' && s.content.length > 0), true);
  assert.equal(plan.remaining, 8);
  // Coverage, drift and verification all work from digests, so nothing else needs reading at all.
  const status: any = await wiki.status();
  assert.equal(status.uncovered.length, 13);
});

test('a page can cite a file inside a pattern it claims, and a link out of the wiki says so', async () => {
  const wiki = await setup();
  writeFileSync(join(wiki.root, 'src/pool.ts'), 'export const pool = [];\n');
  git(wiki.root, 'add', '.'); git(wiki.root, 'commit', '-qm', 'pool');
  await publish(wiki, { pages: [
    { path: 'concepts/other.md', meta: { type: 'concept', title: 'Other', description: 'Other', sources: [] }, body: 'Text.' },
    // Evidence names a file; the source is the pattern that covers it. Comparing those as strings
    // made this an error, and the only way out was to delete the relation.
    { path: 'concepts/src.md', meta: { type: 'entity', title: 'The src module', description: 'src',
      sources: ['src'], wikipoke: { relations: [{ type: 'related_to', target: 'concepts/other.md',
        evidence: ['src/pool.ts'], basis: 'observed' }] } }, body: 'Retries and a pool.' }] });
  assert.deepEqual((await wiki.lint()).filter(f => f.code === 'unknown-evidence'), []);

  // A `../` from a page at the root cannot resolve to anything, and saying "broken link" reads as a
  // page that is merely missing.
  await publish(wiki, { pages: [{ path: 'stray.md', meta: { type: 'concept', title: 'Stray',
    description: 'Stray', sources: ['src'] }, body: 'See [nothing](../outside.md).' }] });
  const escaping = (await wiki.lint()).find(f => f.code === 'link-escapes-wiki');
  assert.match(escaping!.message, /points above the wiki root/);
  assert.equal((await wiki.lint()).some(f => f.code === 'broken-link' && f.message.includes('outside')), false);
});

test('pages can be checked before they are published, and nothing is written', async () => {
  const wiki = await setup();
  const drafts = [{ path: 'concepts/retries.md', body: 'Requests use three retries.',
    meta: { type: 'concept', title: 'Retries', description: 'Retry policy', sources: ['src'],
      wikipoke: { relations: [{ type: 'related_to', target: 'concepts/missing.md', evidence: [], basis: 'inferred' }] } } }];
  const report: any = await wiki.lintPages(drafts as any);
  assert.deepEqual(report.pages, ['concepts/retries.md']);
  assert.equal(report.publishable, true);
  assert.equal(report.findings.some((f: any) => f.code === 'broken-link'), true);
  assert.equal(existsSync(join(wiki.root, 'wiki/concepts/retries.md')), false, 'a check must not write');
  assert.equal(wiki.pages().length, 0);

  // The checks publish would refuse on are refused here too, at no cost.
  await assert.rejects(wiki.lintPages([{ ...drafts[0], meta: { ...drafts[0].meta, sources: ['nowhere'] } }] as any),
    /Unverified source: nowhere/);
});

test('the taxonomy is proposed, never imposed', async () => {
  const wiki = await setup();
  // A page at the root when its type has a home: nobody chose that place.
  await publish(wiki, { pages: [
    { path: 'flat.md', meta: { type: 'entity', title: 'Flat', description: 'Flat', sources: ['src'] }, body: 'Text.' },
    { path: 'entities/placed.md', meta: { type: 'entity', title: 'Placed', description: 'Placed', sources: ['src'] }, body: 'Text.' },
    // A project that put a page under a folder of its own made a decision; second-guessing it would
    // be the tool imposing a taxonomy rather than proposing one.
    { path: 'apps/theirs.md', meta: { type: 'entity', title: 'Theirs', description: 'Theirs', sources: ['src'] }, body: 'Text.' }] });
  const unplaced = (await wiki.lint()).filter(f => f.code === 'unplaced-page');
  assert.deepEqual(unplaced.map(f => f.page), ['flat.md']);
  assert.equal(unplaced[0].severity, 'warning', 'a suggestion, so it never blocks a publication');
  assert.match(unplaced[0].message, /entities\/flat\.md/);

  // The pages Wikipoke generates read the same map, so the taxonomy has one definition.
  await wiki.ask('How many retries?', 'placed-query');
  assert.equal(wiki.pages().find(p => p.meta.type === 'query')!.path.startsWith('queries/'), true);
});

test('a project can remap where its page types live', async () => {
  const wiki = await setup();
  const configPath = join(wiki.root, 'wikipoke.config.yaml');
  writeFileSync(configPath, readFileSync(configPath, 'utf8')
    .replace('entity: entities', 'entity: modules').replace('query: queries', 'query: preguntas'));
  const remapped = new Wiki(wiki.root);
  await publish(remapped, { pages: [{ path: 'entities/old.md',
    meta: { type: 'entity', title: 'Old', description: 'Old', sources: ['src'] }, body: 'Text.' }] });
  // `entities/` is now just a folder like any other: the project decides, and only a page with no
  // folder at all is ever mentioned.
  assert.deepEqual((await remapped.lint()).filter(f => f.code === 'unplaced-page'), []);
  await remapped.ask('Why?', 'remapped');
  assert.equal(remapped.pages().find(p => p.meta.type === 'query')!.path.startsWith('preguntas/'), true);
});
