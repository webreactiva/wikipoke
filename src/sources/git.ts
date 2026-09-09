import { execFileSync } from 'node:child_process';
import { minimatch } from 'minimatch';
import type { Config, Inventory, Source } from '../model.js';
import { hash } from '../runtime/store.js';

const scan = 8 * 1024, budget = 32 * 1024 * 1024, span = 512;
// A digest is written into every page and only ever answers "is this the same content". Sixteen hex
// characters settle that; the other forty-eight are carried, diffed and re-read forever for nothing.
// Callers compare by prefix, so a wiki written by an earlier release stays valid.
const digest = 16, shortRevision = 12;
interface Blob { name: string; oid: string; size: number }

export function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: budget });
}
export function revision(root: string, ref = 'HEAD'): string {
  return git(root, 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim();
}
function matches(path: string, pattern: string): boolean { return minimatch(path, pattern, { dot: true }); }
export function ignored(name: string, config: Config): boolean {
  return name === config.wiki || name.startsWith(config.wiki + '/') || name.startsWith('.wikipoke/') ||
    name.startsWith('.git/') || name === 'wikipoke.config.yaml' ||
    !config.include.some(p => matches(name, p)) || config.exclude.some(p => matches(name, p)) ||
    /(^|\/)(\.env(?:\..*)?|id_rsa|id_ed25519)$/.test(name);
}
function textual(bytes: Buffer): boolean {
  const head = bytes.subarray(0, scan);
  if (head.includes(0)) return false;
  try { new TextDecoder('utf8', { fatal: true }).decode(head, { stream: head.length < bytes.length }); return true; }
  catch { return false; }
}
function sized(root: string, blobs: Omit<Blob, 'size'>[]): Blob[] {
  if (!blobs.length) return [];
  const report = execFileSync('git', ['-C', root, 'cat-file', '--batch-check=%(objectsize)'],
    { input: blobs.map(b => b.oid).join('\n') + '\n', encoding: 'utf8', maxBuffer: blobs.length * 64 + 4096 }).split('\n');
  return blobs.map((blob, position) => ({ ...blob, size: Number(report[position]) || 0 }));
}
function groups(blobs: Blob[]): Blob[][] {
  const batches: Blob[][] = [];
  let group: Blob[] = [], bytes = 0;
  for (const blob of blobs) {
    if (group.length && (group.length >= span || bytes + blob.size > budget)) { batches.push(group); group = []; bytes = 0; }
    group.push(blob); bytes += blob.size;
  }
  if (group.length) batches.push(group);
  return batches;
}
function contents(root: string, group: Blob[]): Buffer {
  const bytes = group.reduce((total, blob) => total + blob.size, 0);
  return execFileSync('git', ['-C', root, 'cat-file', '--batch'],
    { input: group.map(blob => blob.oid).join('\n') + '\n', maxBuffer: bytes + group.length * 128 + 4096 });
}
// Which included sources moved between two commits. Deterministic and cheap: one `git diff`, no
// blob reads, because the caller only needs the names to match against what was explained.
export function changed(root: string, config: Config, from: string, to = 'HEAD'): string[] {
  const rows = git(root, 'diff', '--name-only', '-z', `${from}..${to}`).split('\0').filter(Boolean);
  return rows.filter(name => !ignored(name, config));
}
// In-scope source that differs from what is committed. The inventory reads the committed tree, so
// an agent documenting code it just wrote would describe the previous version - and a commit later
// the page it just published is back in the debt list. Reporting it lets the agent commit first
// rather than discover the loop afterwards.
export function uncommitted(root: string, config: Config): string[] {
  const rows = git(root, 'status', '--porcelain', '-z').split('\0').filter(Boolean);
  const names = rows.map(row => row.slice(3)).filter(Boolean);
  return [...new Set(names.filter(name => !ignored(name, config)))].sort();
}
export function inventory(root: string, config: Config, ref = 'HEAD'): Inventory {
  const rev = revision(root, ref);
  const rows = git(root, 'ls-tree', '-r', '-z', rev).split('\0').filter(Boolean);
  const wanted = rows.flatMap(row => {
    const split = row.indexOf('\t'), name = row.slice(split + 1), [mode, , oid] = row.slice(0, split).split(' ');
    if (mode !== '100644' && mode !== '100755') return [];
    return ignored(name, config) ? [] : [{ name, oid }];
  });
  const sources: Source[] = [];
  for (const group of groups(sized(root, wanted))) {
    const output = contents(root, group);
    let cursor = 0;
    for (const blob of group) {
      const stop = output.indexOf(10, cursor);
      if (stop < 0) break;
      // git cat-file --batch answers each request as "<oid> <type> <size>\n<bytes>\n"; a missing object has no body.
      const size = Number(output.toString('latin1', cursor, stop).split(' ')[2]);
      if (!Number.isFinite(size)) { cursor = stop + 1; continue; }
      const body = output.subarray(stop + 1, stop + 1 + size);
      cursor = stop + 2 + size;
      if (!textual(body)) continue;
      const content = body.toString('utf8');
      sources.push({ id: blob.name, resource: blob.name, revision: rev.slice(0, shortRevision),
        hash: hash(content).slice(0, digest), content });
    }
  }
  return { revision: rev, sources };
}
