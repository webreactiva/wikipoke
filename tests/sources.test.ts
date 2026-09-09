import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inventory } from '../src/sources/git.js';
import { hash } from '../src/runtime/store.js';
import type { Config } from '../src/model.js';

const config: Config = { version: 1, wiki: 'wiki', language: 'en', include: ['src/**'], exclude: ['src/vendor/**'],
  limits: { batchFiles: 5, batchBytes: 64 * 1024 } };
function git(root: string, ...args: string[]) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'wikipoke-sources-'));
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
  mkdirSync(join(root, 'src')); return root;
}
function commit(root: string) { git(root, 'add', '-A'); git(root, 'commit', '-qm', 'change'); }

test('inventory reads every included file in one pass across batch groups', () => {
  const root = repository(), total = 600;
  for (let n = 0; n < total; n++) writeFileSync(join(root, `src/mod${n}.ts`), `export const value${n} = ${n};\n`);
  mkdirSync(join(root, 'src/vendor')); writeFileSync(join(root, 'src/vendor/lib.ts'), 'vendored\n');
  mkdirSync(join(root, 'wiki')); writeFileSync(join(root, 'wiki/index.md'), '# Knowledge index\n');
  writeFileSync(join(root, 'src/.env.local'), 'TOKEN=secret\n');
  writeFileSync(join(root, 'README.md'), 'outside include\n');
  commit(root);
  const inv = inventory(root, config);
  assert.equal(inv.revision, git(root, 'rev-parse', 'HEAD'));
  assert.equal(inv.sources.length, total);
  const names = new Set(inv.sources.map(source => source.id));
  assert.equal(names.has('src/vendor/lib.ts'), false);
  assert.equal(names.has('wiki/index.md'), false);
  assert.equal(names.has('src/.env.local'), false);
  assert.equal(names.has('README.md'), false);
  const first = inv.sources.find(source => source.id === 'src/mod0.ts')!;
  assert.equal(first.content, 'export const value0 = 0;\n');
  assert.equal(first.resource, 'src/mod0.ts');
  // Both digests are abbreviated: they only ever answer "same content, same commit", and every page
  // in the wiki carries them. The full values stay derivable from the repository.
  assert.equal(first.revision, inv.revision.slice(0, 12));
  assert.equal(first.hash, hash('export const value0 = 0;\n').slice(0, 16));
  assert.equal(inv.sources.find(source => source.id === 'src/mod599.ts')!.content, 'export const value599 = 599;\n');
});

test('inventory keeps text with multibyte characters and drops binary blobs', () => {
  const root = repository();
  writeFileSync(join(root, 'src/text.md'), 'Programación con acentos y emoji 🐙\n');
  writeFileSync(join(root, 'src/invalid.bin'), Buffer.from([0xff, 0xfe, 0xc3, 0x28, 0x80, 0x41, 0x42]));
  writeFileSync(join(root, 'src/nul.bin'), Buffer.from('head\0tail', 'latin1'));
  writeFileSync(join(root, 'src/past-window.md'), Buffer.concat([Buffer.alloc(9000, 0x41), Buffer.from([0xff, 0xff])]));
  commit(root);
  const names = inventory(root, config).sources.map(source => source.id);
  assert.deepEqual(names.sort(), ['src/past-window.md', 'src/text.md']);
  const text = inventory(root, config).sources.find(source => source.id === 'src/text.md')!;
  assert.equal(text.content, 'Programación con acentos y emoji 🐙\n');
  assert.equal(text.hash, hash('Programación con acentos y emoji 🐙\n').slice(0, 16));
});

test('inventory ignores symlink entries', () => {
  const root = repository();
  writeFileSync(join(root, 'src/real.ts'), 'export const real = true;\n');
  symlinkSync('real.ts', join(root, 'src/link.ts'));
  commit(root);
  assert.deepEqual(inventory(root, config).sources.map(source => source.id), ['src/real.ts']);
});
