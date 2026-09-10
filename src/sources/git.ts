import { execFileSync } from 'node:child_process';
import { minimatch } from 'minimatch';
import type { Config, Inventory, Manifest, Source, SourceMeta } from '../model.js';
import { hash } from '../runtime/store.js';

// Blobs are read a group at a time, and the group is the peak. Thirty-two megabytes of source
// becomes that again as decoded strings before any of it can be released; eight keeps the peak flat
// at the cost of a few more `cat-file` invocations, which are cheap next to the memory.
const scan = 8 * 1024, budget = 8 * 1024 * 1024, span = 512;
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
function ignored(name: string, config: Config): boolean {
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
// In-scope source that differs from what is committed. The inventory reads the committed tree, so
// an agent documenting code it just wrote would describe the previous version - and a commit later
// the page it just published is back in the debt list. Reporting it lets the agent commit first
// rather than discover the loop afterwards.
export function uncommitted(root: string, config: Config): string[] {
  const rows = git(root, 'status', '--porcelain', '-z').split('\0').filter(Boolean);
  const names = rows.map(row => row.slice(3)).filter(Boolean);
  return [...new Set(names.filter(name => !ignored(name, config)))].sort();
}
// One walk over the tree, reading blobs a group at a time. `keep` decides which contents survive the
// group they were read in; everything else is hashed and dropped, so the peak is one group rather
// than the whole repository. Callers that need no content at all keep none.
function walk(root: string, config: Config, ref: string, keep: (name: string) => boolean): Inventory {
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
      // Hashing the bytes gives the same digest as hashing the decoded string, so a source nobody
      // asked the content of is never decoded at all - no string is created to be dropped.
      const wanted_ = keep(blob.name);
      sources.push({ id: blob.name, resource: blob.name, revision: rev.slice(0, shortRevision),
        hash: hash(body).slice(0, digest), size: body.length,
        content: wanted_ ? body.toString('utf8') : '' });
    }
  }
  return { revision: rev, sources };
}
export function inventory(root: string, config: Config, ref = 'HEAD'): Inventory {
  return walk(root, config, ref, () => true);
}
// A page's source is a pattern. Three spellings, because all three are what people write: the exact
// path of one file, a directory claiming everything beneath it, and a glob. The directory form is
// the one that matters - it is how a single page covers a module without listing its files, and
// without a new page appearing every time somebody adds one.
export function covers(pattern: string, id: string): boolean {
  const bare = pattern.replace(/\/+$/, '');
  return id === bare || id.startsWith(`${bare}/`) || matches(id, pattern);
}
export function matched(sources: SourceMeta[], pattern: string): SourceMeta[] {
  return sources.filter(source => covers(pattern, source.id));
}
// The digest of what a pattern matches, so a file changing, appearing or disappearing underneath it
// moves the page that claims it. A pattern naming one file keeps that file's own digest: every page
// written before patterns existed names exactly one file, and recomputing those as set digests would
// report every wiki already on disk as drifted the moment the tool is upgraded.
export function digestOf(sources: SourceMeta[], pattern: string): string {
  const set = matched(sources, pattern);
  if (set.length === 1 && set[0].id === pattern) return set[0].hash;
  return hash(set.map(source => `${source.id}:${source.hash}`).sort().join('\n')).slice(0, digest);
}
// Which in-scope files differ between two commits. This is the cheap half of "did the code move
// while you were writing": one diff, rather than a second walk of the whole tree to rebuild an
// inventory that Git can answer directly. Renames are reported under both names on purpose - a page
// claiming either side has to be told.
export function changed(root: string, config: Config, from: string, to = 'HEAD'): string[] {
  const names = git(root, 'diff', '--name-only', '--no-renames', '-z',
    revision(root, from), revision(root, to)).split('\0').filter(Boolean);
  return [...new Set(names.filter(name => !ignored(name, config)))].sort();
}
// Identity and digest for every source in scope, and no content at all.
export function manifest(root: string, config: Config, ref = 'HEAD'): Manifest {
  const { revision: rev, sources } = walk(root, config, ref, () => false);
  return { revision: rev, sources: sources.map(({ content, ...meta }) => meta) };
}
// The content of a named few, for the one command that reads code rather than checking it.
export function sourcesFor(root: string, config: Config, ids: string[], ref = 'HEAD'): Source[] {
  const wanted = new Set(ids);
  return walk(root, config, ref, name => wanted.has(name)).sources.filter(s => wanted.has(s.id));
}
