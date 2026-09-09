import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { parse } from 'yaml';

const cli = resolve(import.meta.dirname, '../src/cli.ts');
function run(root: string, ...args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', cli, '--root', root, ...args], { encoding: 'utf8' });
}
function git(root: string, ...args: string[]) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}
function directory() { return mkdtempSync(join(tmpdir(), 'wikipoke-cli-')); }
function repository() {
  const root = directory();
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
  mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/main.ts'), 'export const retries = 3;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'initial');
  return root;
}

test('init refuses a directory that is not a Git repository and writes nothing', () => {
  const root = directory(), result = run(root, 'init', '--include', 'src/**');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Not a Git repository with at least one commit/);
  assert.equal(existsSync(join(root, 'wikipoke.config.yaml')), false);
  assert.equal(existsSync(join(root, '.wikipoke')), false);
  assert.equal(existsSync(join(root, 'wiki')), false);
});

test('init refuses a repository without commits', () => {
  const root = directory();
  git(root, 'init', '-q');
  const result = run(root, 'init', '--include', 'src/**');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /at least one commit/);
  assert.equal(existsSync(join(root, 'wikipoke.config.yaml')), false);
});

test('init records per-installation batch limits and rejects an invalid one', () => {
  const root = repository(), result = run(root, 'init', '--include', 'src/**', '--batch-files', '3', '--batch-bytes', '4096');
  assert.equal(result.status, 0);
  const config = parse(readFileSync(join(root, 'wikipoke.config.yaml'), 'utf8')) as { limits: { batchFiles: number; batchBytes: number } };
  assert.equal(config.limits.batchFiles, 3);
  assert.equal(config.limits.batchBytes, 4096);
  const invalid = run(repository(), 'init', '--include', 'src/**', '--batch-files', '0');
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /positive integer/);
  const invalidBytes = run(repository(), 'init', '--include', 'src/**', '--batch-bytes', '0');
  assert.equal(invalidBytes.status, 1);
  assert.match(invalidBytes.stderr, /positive integer/);
});

test('init keeps ten source files and sixty-four kilobytes per pass by default', () => {
  const root = repository();
  assert.equal(run(root, 'init', '--include', 'src/**').status, 0);
  const config = parse(readFileSync(join(root, 'wikipoke.config.yaml'), 'utf8')) as { limits: { batchFiles: number; batchBytes: number } };
  assert.equal(config.limits.batchFiles, 10);
  assert.equal(config.limits.batchBytes, 64 * 1024);
});

test('doctor diagnoses an unconfigured directory instead of demanding init', () => {
  const result = run(directory(), 'doctor');
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout) as Record<string, any>;
  assert.match(report.node, /^v\d+/);
  assert.equal(report.config, null);
  assert.equal(report.repository, false);
  assert.equal(report.pending, null);
  assert.equal(report.hookComposed, false);
  assert.ok(report.problems.some((problem: string) => /run init/.test(problem)));
  assert.ok(report.problems.some((problem: string) => /No Git repository/.test(problem)));
});

test('doctor reports pending work once the wiki exists', () => {
  const root = repository();
  assert.equal(run(root, 'init', '--include', 'src/**').status, 0);
  const result = run(root, 'doctor');
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout) as Record<string, any>;
  assert.equal(report.config, 'wikipoke.config.yaml');
  assert.equal(report.repository, true);
  assert.equal(report.wiki, 'wiki');
  assert.equal(report.pending, 1);
});

test('maintain --once refreshes the deterministic attention signal', () => {
  const root = repository();
  assert.equal(run(root, 'init', '--include', 'src/**').status, 0);
  const result = run(root, 'maintain', '--once');
  assert.equal(result.stderr, '');
  assert.equal(result.status, 0);
  const signal = join(root, '.wikipoke/attention.json');
  assert.ok(existsSync(signal), 'maintain --once must write the attention signal');
  const written = JSON.parse(readFileSync(signal, 'utf8'));
  assert.equal(typeof written, 'object');
  assert.ok(written && Object.keys(written).length > 0);
  assert.equal(typeof JSON.parse(result.stdout), 'object');
});

test('recover --unlock reports the recorded owner and frees a stale lock', () => {
  const root = repository();
  assert.equal(run(root, 'init', '--include', 'src/**').status, 0);
  const lock = join(root, '.wikipoke/write.lock');
  mkdirSync(lock, { recursive: true });
  writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: 999999, at: new Date().toISOString() }, null, 2) + '\n');
  assert.equal(run(root, 'status').status, 1);
  const result = run(root, 'recover', '--unlock');
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout) as { released: boolean; owner: { pid?: number } | null };
  assert.equal(report.released, true);
  assert.equal(report.owner?.pid, 999999);
  assert.equal(existsSync(lock), false);
  assert.equal(run(root, 'status').status, 0);
});

test('recover never releases a lock without the explicit flag', () => {
  const root = repository();
  assert.equal(run(root, 'init', '--include', 'src/**').status, 0);
  const lock = join(root, '.wikipoke/write.lock');
  mkdirSync(lock, { recursive: true });
  const result = run(root, 'recover');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--unlock/);
  assert.ok(existsSync(lock));
});
