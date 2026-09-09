import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, json, read, files, safePath } from '../src/runtime/store.js';

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

test('file listing skips symlinks instead of failing the whole wiki', () => {
  const root = mkdtempSync(join(tmpdir(), 'wikipoke-files-'));
  mkdirSync(join(root, 'wiki/concepts'), { recursive: true });
  writeFileSync(join(root, 'wiki/index.md'), '# Knowledge index\n');
  writeFileSync(join(root, 'wiki/concepts/retries.md'), 'body\n');
  writeFileSync(join(root, 'outside.md'), 'body\n');
  symlinkSync(join(root, 'outside.md'), join(root, 'wiki/escape.md'));
  symlinkSync(join(root, 'wiki/concepts'), join(root, 'wiki/loop'));
  assert.deepEqual(files(join(root, 'wiki')), [join(root, 'wiki/concepts/retries.md'), join(root, 'wiki/index.md')]);
  assert.throws(() => safePath(root, 'wiki/escape.md'), /Symlink path/);
});

test('unlock reports the recorded owner and frees the lock', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wikipoke-lock-')), store = new Store(root);
  assert.deepEqual(store.unlock(), { released: false, owner: null });
  let inside: { released: boolean; owner: unknown } | null = null;
  await store.locked(async () => {
    await assert.rejects(store.locked(() => {}), /Wiki writer locked/);
    inside = store.unlock();
  });
  assert.equal((inside as any).released, true);
  assert.equal((inside as any).owner.pid, process.pid);
  assert.equal(typeof (inside as any).owner.at, 'string');
  assert.equal(existsSync(join(root, '.wikipoke/write.lock')), false);
  await store.locked(() => {});
  assert.equal(existsSync(join(root, '.wikipoke/write.lock')), false);
});

test('locking reports real filesystem failures and never strands the lock directory', async t => {
  if (process.getuid?.() === 0) return t.skip('root bypasses permission checks');
  const root = mkdtempSync(join(tmpdir(), 'wikipoke-lock-fail-')), store = new Store(root);
  const control = join(root, '.wikipoke'), lock = join(control, 'write.lock');
  mkdirSync(control);
  const mask = process.umask(0o777);
  let stranded = true;
  try { await assert.rejects(store.locked(() => {}), /EACCES/); stranded = existsSync(lock); }
  finally { process.umask(mask); rmSync(lock, { force: true, recursive: true }); }
  assert.equal(stranded, false);
  chmodSync(control, 0o500);
  try { await assert.rejects(store.locked(() => {}), (error: Error) => /EACCES/.test(error.message) && !/writer locked/.test(error.message)); }
  finally { chmodSync(control, 0o700); }
});

test('a failing operation releases the lock and keeps its own error', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wikipoke-lock-error-')), store = new Store(root);
  await assert.rejects(store.locked(() => { throw new Error('operation failed'); }), /operation failed/);
  assert.equal(existsSync(join(root, '.wikipoke/write.lock')), false);
  assert.equal(await store.locked(() => 'free'), 'free');
});
