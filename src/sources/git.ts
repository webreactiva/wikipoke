import { execFileSync } from 'node:child_process';
import { minimatch } from 'minimatch';
import type { Config, Inventory } from '../model.js';
import { hash } from '../runtime/store.js';

export function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}
export function revision(root: string, ref = 'HEAD'): string {
  return git(root, 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim();
}
function matches(path: string, pattern: string): boolean { return minimatch(path, pattern, { dot: true }); }
export function inventory(root: string, config: Config, ref = 'HEAD'): Inventory {
  const rev = revision(root, ref);
  const names = git(root, 'ls-tree', '-r', '-z', rev).split('\0').filter(Boolean);
  const sources = names.flatMap(row => {
    const split = row.indexOf('\t'), name = row.slice(split + 1), [mode] = row.slice(0, split).split(' ');
    if (mode !== '100644' && mode !== '100755') return [];
    if (name === config.wiki || name.startsWith(config.wiki + '/') || name.startsWith('.wikipoke/') ||
      name.startsWith('.git/') || name === 'wikipoke.config.yaml' ||
      !config.include.some(p => matches(name, p)) ||
      config.exclude.some(p => matches(name, p)) ||
      /(^|\/)(\.env(?:\..*)?|id_rsa|id_ed25519)$/.test(name)) return [];
    const content = git(root, 'show', `${rev}:${name}`);
    if (content.includes('\0')) return [];
    return [{ id: name, resource: name, revision: rev, hash: hash(content), content }];
  });
  return { revision: rev, sources };
}
