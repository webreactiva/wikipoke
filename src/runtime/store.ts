import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync,
  writeFileSync, unlinkSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function read(path: string): string | null {
  try { return readFileSync(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export function safePath(root: string, name: string): string {
  if (isAbsolute(name) || name.includes('\0')) throw new Error(`Unsafe path: ${name}`);
  const target = resolve(root, name), rel = relative(resolve(root), target);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..') throw new Error(`Path outside scope: ${name}`);
  let cursor = resolve(root);
  if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlink root: ${root}`);
  for (const part of rel.split(sep)) {
    cursor = resolve(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlink path: ${name}`);
  }
  return target;
}
export function atomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temp, 'wx', 0o600);
  try { writeFileSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, path);
}
export const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
export function files(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) return [];
    const full = resolve(root, entry.name);
    return entry.isDirectory() ? files(full) : entry.isFile() ? [full] : [];
  }).sort();
}
function release(lock: string): boolean {
  // A failed unlink is not swallowed: it leaves owner.json behind and the rmdir below reports ENOTEMPTY.
  try { unlinkSync(resolve(lock, 'owner.json')); } catch { }
  try { rmdirSync(lock); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
interface Write { path: string; before: string | null; after: string }
export class Store {
  readonly control: string;
  constructor(readonly root: string) { this.control = safePath(root, '.wikipoke'); }
  path(name: string) { return safePath(this.root, name); }
  load<T>(name: string, fallback: T): T {
    const value = read(this.path(name)); return value === null ? fallback : JSON.parse(value);
  }
  async locked<T>(run: () => T | Promise<T>): Promise<T> {
    mkdirSync(this.control, { recursive: true });
    // rmdir never recursively deletes another writer's data.
    const lock = this.path('.wikipoke/write.lock');
    try { mkdirSync(lock); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      throw new Error('Wiki writer locked. If its process died, inspect then use recover --unlock.');
    }
    try { atomic(resolve(lock, 'owner.json'), json({ pid: process.pid, at: new Date().toISOString() })); }
    catch (error) { try { release(lock); } catch { } throw error; }
    let result: T;
    try { this.recover(); result = await run(); }
    catch (error) { try { release(lock); } catch { } throw error; }
    release(lock);
    return result;
  }
  unlock(): { released: boolean; owner: unknown } {
    const lock = this.path('.wikipoke/write.lock'), record = read(resolve(lock, 'owner.json'));
    let owner: unknown = record;
    if (record !== null) try { owner = JSON.parse(record); } catch { }
    return { released: release(lock), owner };
  }
  recover(): void {
    const journal = this.load<{ writes: Write[] } | null>('.wikipoke/transaction.json', null);
    if (!journal) return;
    for (const write of journal.writes) {
      const current = read(this.path(write.path));
      if (current !== write.before && current !== write.after)
        throw new Error(`Recovery conflict: ${write.path}; preserve external edits before retrying`);
    }
    for (const write of journal.writes) {
      if (read(this.path(write.path)) !== write.after) atomic(this.path(write.path), write.after);
    }
    unlinkSync(this.path('.wikipoke/transaction.json'));
  }
  commit(writes: Write[]): void {
    const unique = new Set(writes.map(w => w.path));
    if (unique.size !== writes.length) throw new Error('Duplicate transaction path');
    for (const w of writes) {
      if (w.path === '.wikipoke/transaction.json' || read(this.path(w.path)) !== w.before)
        throw new Error(`Concurrent edit: ${w.path}`);
    }
    atomic(this.path('.wikipoke/transaction.json'), json({ writes }));
    this.recover();
  }
}
