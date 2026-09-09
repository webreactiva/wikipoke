import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, rmdirSync, rmSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { Store, atomic, read } from './runtime/store.js';

const header = '<!-- managed by wikipoke; do not edit this line -->';
const marker = 'managed by Wikipoke';
const notifier = '.wikipoke/hooks/post-commit';
const skills: Record<string, string> = {
  'wikipoke-ingest': `---
name: wikipoke-ingest
description: Reconcile the project wiki with changed source code using Wikipoke.
user_invocable: true
---

${header}

Run \`npx --no-install wikipoke ingest\` to obtain the bounded source plan. Read the
returned sources and related pages yourself, get the exact payload contract with
\`npx --no-install wikipoke schema patch\`, then prepare a structured patch and publish it with
\`npx --no-install wikipoke publish --patch <file>\`. Do not modify source code.
`,
  'wikipoke-query': `---
name: wikipoke-query
description: Ask Wikipoke a grounded question and preserve the query record.
user_invocable: true
---

${header}

Run \`npx --no-install wikipoke ask "<question>" --request-id <id>\` first. Read the
suggested wiki pages and source evidence yourself, get the exact payload contract with
\`npx --no-install wikipoke schema answer\`, then persist a cited answer with
\`npx --no-install wikipoke answer --request-id <id> --response <file>\`.
`,
  'wikipoke-decision': `---
name: wikipoke-decision
description: Capture an implementation choice or close a task's decision record.
user_invocable: true
---

${header}

Use \`npx --no-install wikipoke capture --event <event.json>\` when a relevant decision is made,
and before closing a task. Do not reconstruct undisclosed rationale from a diff.
`,
};
const notifierScript = `#!/bin/sh
# ${marker}; safe notifier, never runs an LLM or blocks a commit.
# Refreshes .wikipoke/attention.json in place: a failed run keeps the previous signal.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -n "$root" ] || exit 0
if [ -x "$root/node_modules/.bin/wikipoke" ]; then
  "$root/node_modules/.bin/wikipoke" --root "$root" maintain --once >/dev/null 2>&1 || exit 0
elif command -v npx >/dev/null 2>&1; then
  npx --no-install wikipoke --root "$root" maintain --once >/dev/null 2>&1 || exit 0
fi
exit 0
`;
const delegatorScript = `#!/bin/sh
# ${marker}; delegates to the project-local notifier, resolved at run time.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
hook="$root/${notifier}"
[ -x "$hook" ] || exit 0
exec "$hook" "$@"
`;

export interface InstallReport { skills: string[]; hook: string; activeHook: boolean; manual: string[] }
export interface UninstallReport { removed: string[]; preserved: string[]; manual: string[] }
function hookPath(root: string): string {
  const value = execFileSync('git', ['-C', root, 'rev-parse', '--git-path', 'hooks'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  return value.startsWith('/') ? value : `${root}/${value}`;
}
export function hookActive(root: string): boolean {
  try { return read(`${hookPath(root)}/post-commit`)?.includes(notifier) ?? false; }
  catch { return false; }
}
export function install(root: string): InstallReport {
  const store = new Store(root), manual: string[] = [], installed: string[] = [];
  for (const [name, content] of Object.entries(skills)) {
    const path = store.path(`.agents/skills/${name}/SKILL.md`), old = read(path);
    if (old !== null && !old.includes(header)) { manual.push(`Skipped ${relative(root, path)}: not managed by Wikipoke.`); continue; }
    atomic(path, content); installed.push(relative(root, path));
  }
  const hook = store.path(notifier);
  atomic(hook, notifierScript);
  chmodSync(hook, 0o755);
  let activeHook = false;
  const target = `${hookPath(root)}/post-commit`;
  if (!existsSync(target)) {
    atomic(target, delegatorScript);
    chmodSync(target, 0o755);
    activeHook = true;
  } else if (hookActive(root)) activeHook = true;
  else manual.push(`Compose ${relative(root, hook)} from the project's existing post-commit hook manager.`);
  manual.push('Schedule `npx --no-install wikipoke maintain --once` to refresh the deterministic attention signal.');
  return { skills: installed, hook: relative(root, hook), activeHook, manual };
}
function prune(directory: string): void { try { rmdirSync(directory); } catch { /* keep non-empty directories */ } }
function wikiDirectory(root: string): string {
  try {
    const raw = read(resolve(root, 'wikipoke.config.yaml'));
    const value = raw === null ? null : (parse(raw) as { wiki?: unknown }).wiki;
    return typeof value === 'string' && value ? value : 'wiki';
  } catch { return 'wiki'; }
}
export function uninstall(root: string): UninstallReport {
  const store = new Store(root), removed: string[] = [], preserved: string[] = [], manual: string[] = [];
  for (const name of Object.keys(skills)) {
    const path = store.path(`.agents/skills/${name}/SKILL.md`), old = read(path);
    if (old === null) continue;
    if (!old.includes(header)) { preserved.push(relative(root, path)); manual.push(`Kept ${relative(root, path)}: not managed by Wikipoke.`); continue; }
    rmSync(path); removed.push(relative(root, path)); prune(dirname(path));
  }
  prune(store.path('.agents/skills')); prune(store.path('.agents'));
  const hook = store.path(notifier);
  if (read(hook) !== null) { rmSync(hook); removed.push(relative(root, hook)); prune(dirname(hook)); }
  try {
    const target = `${hookPath(root)}/post-commit`, old = read(target);
    if (old !== null && old.includes(marker) && old.includes(notifier)) { rmSync(target); removed.push(relative(root, target)); }
    else if (old !== null) { preserved.push(relative(root, target)); manual.push(`Kept ${relative(root, target)}: not installed by Wikipoke.`); }
  } catch { manual.push('Skipped the Git hook: no repository at this root.'); }
  for (const name of [wikiDirectory(root), 'wikipoke.config.yaml', '.wikipoke/state.json',
    '.wikipoke/events', '.wikipoke/releases', '.wikipoke/attention.json']) {
    try { if (existsSync(store.path(name))) preserved.push(name); } catch { /* a hand-edited wiki path stays untouched */ }
  }
  return { removed, preserved, manual };
}
