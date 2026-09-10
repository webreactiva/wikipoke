import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import { extensionSchema } from '../src/model.js';

const cli = resolve(import.meta.dirname, '../src/cli.ts');
function run(root: string, ...args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', cli, '--root', root, ...args], { encoding: 'utf8' });
}
function git(root: string, ...args: string[]) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}
function repository() {
  const root = mkdtempSync(join(tmpdir(), 'wikipoke-ext-'));
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
  mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/main.ts'), 'export const retries = 3;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'initial');
  run(root, 'init', '--include', 'src/**');
  return root;
}
// Extensions are declared in the configuration, so attaching one in a test is editing that file -
// which is exactly what a project does.
function attach(root: string, ...extensions: Record<string, unknown>[]) {
  const path = join(root, 'wikipoke.config.yaml');
  const config = parse(readFileSync(path, 'utf8'));
  config.extensions = [...(config.extensions ?? []), ...extensions];
  writeFileSync(path, stringify(config));
}
function script(root: string, name: string, body: string) {
  const path = join(root, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`); chmodSync(path, 0o755);
  return `./${name}`;
}

test('a declared extension receives the event on stdin and in its environment', () => {
  const root = repository();
  attach(root, { event: 'ingest.after', run: script(root, 'watch.sh', 'cat > seen.json; echo "$WIKIPOKE_EVENT" > seen.event') });
  const result = run(root, 'ingest');
  assert.equal(result.status, 0);
  const payload = JSON.parse(readFileSync(join(root, 'seen.json'), 'utf8'));
  assert.equal(payload.event, 'ingest.after');
  assert.equal(payload.root, root);
  assert.deepEqual(payload.sources, ['src/main.ts']);
  assert.equal(payload.complete, false);
  assert.ok(typeof payload.at === 'string' && payload.at.includes('T'));
  assert.equal(readFileSync(join(root, 'seen.event'), 'utf8').trim(), 'ingest.after');
});

// The payload is a summary on purpose. An `ingest` plan carries the full text of every source in the
// batch, and piping that into every extension on every pass is the cost this whole surface replaces.
test('the payload summarizes the command rather than repeating its output', () => {
  const root = repository();
  attach(root, { event: 'ingest.after', run: script(root, 'watch.sh', 'cat > seen.json') });
  run(root, 'ingest');
  const payload = JSON.parse(readFileSync(join(root, 'seen.json'), 'utf8'));
  assert.deepEqual(Object.keys(payload).sort(), ['at', 'complete', 'event', 'remaining', 'revision', 'root', 'sources']);
  assert.equal(JSON.stringify(payload).includes('export const retries'), false);
});

test('a failing observer is reported but never fails the command it was watching', () => {
  const root = repository();
  attach(root, { event: 'ingest.after', run: script(root, 'broken.sh', 'echo "no disk" >&2; exit 3') });
  const result = run(root, 'ingest');
  assert.equal(result.status, 0);
  assert.match(result.stderr, /extension for ingest\.after failed/);
  assert.match(result.stderr, /no disk/);
  // The command's own JSON is still the only thing on stdout, so whatever is parsing it still can.
  assert.equal(JSON.parse(result.stdout).complete, false);
});

test('a blocking before-extension refuses the action and leaves nothing written', () => {
  const root = repository();
  attach(root, { event: 'seal.before', run: script(root, 'veto.sh', 'echo "not reviewed" >&2; exit 1'), blocking: true });
  const before = readFileSync(join(root, '.wikipoke/state.json'), 'utf8');
  const result = run(root, 'seal');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Extension refused seal\.before/);
  assert.match(result.stderr, /not reviewed/);
  assert.equal(readFileSync(join(root, '.wikipoke/state.json'), 'utf8'), before);
});

// A veto is only meaningful where there is still something to stop. Allowed on an `after` event it
// would read as a refusal that silently never fires, which is worse than not offering one.
test('blocking is refused on an event that fires once the action is done', () => {
  const parsed = extensionSchema.safeParse({ event: 'publish.after', run: 'true', blocking: true });
  assert.equal(parsed.success, false);
  assert.match(parsed.error!.issues[0].message, /Only a \.before event can refuse an action/);
  assert.equal(extensionSchema.safeParse({ event: 'publish.before', run: 'true', blocking: true }).success, true);
});

test('an extension can run a Wikipoke command, because it is called outside the writer lock', () => {
  const root = repository();
  // `--import tsx` resolves against the working directory, and the extension's is the project under
  // test; the sources being run live here, so the nested call is made from here.
  // Every path here is quoted: node lives under "Application Support" on a normal macOS install,
  // and an unquoted interpreter path fails on the machine of whoever happens to have one.
  attach(root, { event: 'ingest.after', run: script(root, 'nested.sh',
    `cd "${resolve(import.meta.dirname, '..')}" && "${process.execPath}" --import tsx "${cli}" --root "$WIKIPOKE_ROOT" lint > "$WIKIPOKE_ROOT/lint.json" 2>"$WIKIPOKE_ROOT/lint.err"`) });
  const result = run(root, 'ingest');
  assert.equal(result.status, 0);
  assert.equal(readFileSync(join(root, 'lint.err'), 'utf8').trim(), '');
  assert.ok(Array.isArray(JSON.parse(readFileSync(join(root, 'lint.json'), 'utf8'))));
});

test('extensions fire in declaration order and only for their own event', () => {
  const root = repository();
  attach(root,
    { event: 'ingest.after', run: script(root, 'first.sh', 'echo first >> order.log') },
    { event: 'seal.after', run: script(root, 'never.sh', 'echo sealed >> order.log') },
    { event: 'ingest.after', run: script(root, 'second.sh', 'echo second >> order.log') });
  run(root, 'ingest');
  assert.deepEqual(readFileSync(join(root, 'order.log'), 'utf8').trim().split('\n'), ['first', 'second']);
});

test('a hung extension is cut off at its timeout without hanging the command', () => {
  const root = repository();
  attach(root, { event: 'ingest.after', run: script(root, 'hang.sh', 'sleep 30'), timeout: 1 });
  const started = Date.now(), result = run(root, 'ingest');
  assert.equal(result.status, 0);
  assert.ok(Date.now() - started < 20000, 'the command waited for a hung extension');
  assert.match(result.stderr, /extension for ingest\.after failed/);
});

test('doctor lists what is attached and names an extension it cannot read', () => {
  const root = repository();
  attach(root, { event: 'publish.before', run: './review.sh', blocking: true },
    { event: 'nonsense', run: './review.sh' });
  const report = JSON.parse(run(root, 'doctor').stdout);
  assert.deepEqual(report.extensions, [{ event: 'publish.before', run: './review.sh', timeout: 10, blocking: true }]);
  assert.ok(report.problems.some((problem: string) => problem.startsWith('extensions[1] is not a valid extension')));
});

test('a project with no extensions spawns nothing and behaves exactly as before', () => {
  const root = repository();
  const result = run(root, 'ingest');
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(existsSync(join(root, 'seen.json')), false);
});
