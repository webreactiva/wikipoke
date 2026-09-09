import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';
import { relative } from 'node:path';
import { Store, atomic, read } from './runtime/store.js';

const header = '<!-- managed by wikipoke; do not edit this line -->';
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

export interface InstallReport { skills: string[]; hook: string; activeHook: boolean; manual: string[] }
function hookPath(root: string): string {
  const value = execFileSync('git', ['-C', root, 'rev-parse', '--git-path', 'hooks'], { encoding: 'utf8' }).trim();
  return value.startsWith('/') ? value : `${root}/${value}`;
}
function shellQuote(value: string): string { return `'${value.replaceAll("'", "'\"'\"'")}'`; }
export function hookActive(root: string): boolean {
  try { return read(`${hookPath(root)}/post-commit`)?.includes('.wikipoke/hooks/post-commit') ?? false; }
  catch { return false; }
}
export function install(root: string): InstallReport {
  const store = new Store(root), manual: string[] = [], installed: string[] = [];
  for (const [name, content] of Object.entries(skills)) {
    const path = store.path(`.agents/skills/${name}/SKILL.md`), old = read(path);
    if (old !== null && !old.includes(header)) { manual.push(`Skipped ${relative(root, path)}: not managed by Wikipoke.`); continue; }
    atomic(path, content); installed.push(relative(root, path));
  }
  const hook = store.path('.wikipoke/hooks/post-commit');
  atomic(hook, `#!/bin/sh
# managed by Wikipoke; safe notifier, never runs an LLM or blocks a commit.
command -v npx >/dev/null 2>&1 || exit 0
npx --no-install wikipoke --root "$(git rev-parse --show-toplevel 2>/dev/null)" status > .wikipoke/attention.json 2>/dev/null || true
`);
  chmodSync(hook, 0o755);
  let activeHook = false;
  const target = `${hookPath(root)}/post-commit`;
  if (!existsSync(target)) {
    atomic(target, `#!/bin/sh\n# managed by Wikipoke; delegates to the project-local notifier.\nexec ${shellQuote(hook)} "$@"\n`);
    chmodSync(target, 0o755);
    activeHook = true;
  } else if (hookActive(root)) activeHook = true;
  else manual.push(`Compose ${relative(root, hook)} from the project's existing post-commit hook manager.`);
  manual.push('Schedule `npx --no-install wikipoke maintain --once` to refresh the deterministic attention signal.');
  return { skills: installed, hook: relative(root, hook), activeHook, manual };
}
