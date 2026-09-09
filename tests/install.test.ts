import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { Wiki } from '../src/wiki.js';
import { install, uninstall } from '../src/integrations.js';
import type { Config } from '../src/model.js';

const config: Config = { version: 1, wiki: 'wiki', language: 'en', include: ['src/**'], exclude: [],
  limits: { batchFiles: 5, batchBytes: 64 * 1024 } };
function git(root: string, ...args: string[]) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}
async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'wikipoke-install-'));
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
  mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/main.ts'), 'export const retries = 3;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'initial');
  await Wiki.init(root, config); return new Wiki(root);
}
function fakeCli(root: string, body: string) {
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
  const path = join(root, 'node_modules/.bin/wikipoke');
  writeFileSync(path, `#!/bin/sh\n${body}\n`); chmodSync(path, 0o755);
}
function notify(root: string) {
  return spawnSync(join(root, '.wikipoke/hooks/post-commit'), [], { cwd: root, encoding: 'utf8' });
}

test('install writes valid agent-neutral skills and preserves foreign skill files', async () => {
  const wiki = await setup(), foreign = join(wiki.root, '.agents/skills/wikipoke-query/SKILL.md');
  mkdirSync(join(wiki.root, '.agents/skills/wikipoke-query'), { recursive: true });
  writeFileSync(foreign, 'foreign skill');
  const report = install(wiki.root);
  assert.ok(existsSync(join(wiki.root, '.agents/skills/wikipoke-ingest/SKILL.md')));
  assert.equal(readFileSync(foreign, 'utf8'), 'foreign skill');
  assert.equal(report.activeHook, true);
  assert.match(readFileSync(join(wiki.root, '.git/hooks/post-commit'), 'utf8'), /wikipoke/);
  assert.match(readFileSync(join(wiki.root, '.agents/skills/wikipoke-ingest/SKILL.md'), 'utf8'), /^---/);
  assert.match(readFileSync(join(wiki.root, '.wikipoke/hooks/post-commit'), 'utf8'), /never runs an LLM/);
});

test('install preserves an existing post-commit hook', async () => {
  const wiki = await setup();
  const hook = join(wiki.root, '.git/hooks/post-commit');
  writeFileSync(hook, '#!/bin/sh\necho foreign\n');
  const report = install(wiki.root);
  assert.equal(report.activeHook, false);
  assert.ok(report.manual.some(message => /existing post-commit/.test(message)));
  assert.match(readFileSync(hook, 'utf8'), /foreign/);
});

test('the delegated hook resolves the notifier at run time, not from a baked path', async () => {
  const wiki = await setup();
  install(wiki.root);
  const delegator = readFileSync(join(wiki.root, '.git/hooks/post-commit'), 'utf8');
  assert.doesNotMatch(delegator, new RegExp(wiki.root.replaceAll('.', '\\.')));
  assert.match(delegator, /rev-parse --show-toplevel/);
  fakeCli(wiki.root, 'printf "%s\\n" "$*" > "$2/.wikipoke/invocation"');
  const result = spawnSync(join(wiki.root, '.git/hooks/post-commit'), [], { cwd: wiki.root, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(readFileSync(join(wiki.root, '.wikipoke/invocation'), 'utf8').trim(),
    `--root ${realpathSync(wiki.root)} maintain --once`);
});

test('the notifier refreshes the signal through maintain --once', async () => {
  const wiki = await setup();
  install(wiki.root);
  fakeCli(wiki.root, 'printf "%s\\n" "$*" > "$2/.wikipoke/invocation"\nprintf "{\\"refreshed\\":true}\\n" > "$2/.wikipoke/attention.json"');
  const result = notify(wiki.root);
  assert.equal(result.status, 0);
  assert.equal(readFileSync(join(wiki.root, '.wikipoke/invocation'), 'utf8').trim(),
    `--root ${realpathSync(wiki.root)} maintain --once`);
  assert.equal(readFileSync(join(wiki.root, '.wikipoke/attention.json'), 'utf8'), '{"refreshed":true}\n');
});

test('a failed refresh keeps the previous attention signal and never fails the commit', async () => {
  const wiki = await setup();
  install(wiki.root);
  const signal = join(wiki.root, '.wikipoke/attention.json');
  writeFileSync(signal, '{"drift":{"count":3}}\n');
  fakeCli(wiki.root, 'echo broken >&2\nexit 3');
  const result = notify(wiki.root);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(readFileSync(signal, 'utf8'), '{"drift":{"count":3}}\n');
});

test('the notifier stays silent when no Wikipoke executable is reachable', async () => {
  const wiki = await setup();
  install(wiki.root);
  const signal = join(wiki.root, '.wikipoke/attention.json');
  writeFileSync(signal, '{"drift":{"count":3}}\n');
  const result = spawnSync(join(wiki.root, '.wikipoke/hooks/post-commit'), [],
    { cwd: wiki.root, encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } });
  assert.equal(result.status, 0);
  assert.equal(readFileSync(signal, 'utf8'), '{"drift":{"count":3}}\n');
});

test('uninstall removes only managed files and reports the knowledge it preserved', async () => {
  const wiki = await setup();
  install(wiki.root); install(wiki.root);
  const team = join(wiki.root, '.agents/skills/team-review/SKILL.md');
  mkdirSync(join(wiki.root, '.agents/skills/team-review'), { recursive: true });
  writeFileSync(team, 'team skill');
  writeFileSync(join(wiki.root, '.agents/skills/wikipoke-query/SKILL.md'), 'adopted by the team');
  mkdirSync(join(wiki.root, '.wikipoke/events'), { recursive: true });
  writeFileSync(join(wiki.root, '.wikipoke/events/a.json'), '{}\n');
  const report = uninstall(wiki.root);
  assert.equal(existsSync(join(wiki.root, '.agents/skills/wikipoke-ingest/SKILL.md')), false);
  assert.equal(existsSync(join(wiki.root, '.agents/skills/wikipoke-decision/SKILL.md')), false);
  assert.equal(existsSync(join(wiki.root, '.wikipoke/hooks/post-commit')), false);
  assert.equal(existsSync(join(wiki.root, '.git/hooks/post-commit')), false);
  assert.equal(readFileSync(team, 'utf8'), 'team skill');
  assert.equal(readFileSync(join(wiki.root, '.agents/skills/wikipoke-query/SKILL.md'), 'utf8'), 'adopted by the team');
  assert.ok(existsSync(join(wiki.root, 'wiki/index.md')));
  assert.ok(existsSync(join(wiki.root, '.wikipoke/state.json')));
  assert.ok(existsSync(join(wiki.root, '.wikipoke/events/a.json')));
  assert.ok(existsSync(join(wiki.root, 'wikipoke.config.yaml')));
  assert.ok(report.removed.includes('.wikipoke/hooks/post-commit'));
  assert.ok(report.removed.includes('.git/hooks/post-commit'));
  for (const kept of ['wiki', 'wikipoke.config.yaml', '.wikipoke/state.json', '.wikipoke/events'])
    assert.ok(report.preserved.includes(kept), `expected ${kept} in ${report.preserved.join(', ')}`);
  assert.ok(report.manual.some(message => /not managed by Wikipoke/.test(message)));
});

test('uninstall keeps a post-commit hook it did not install', async () => {
  const wiki = await setup();
  const hook = join(wiki.root, '.git/hooks/post-commit');
  writeFileSync(hook, '#!/bin/sh\n. .wikipoke/hooks/post-commit\necho foreign\n');
  install(wiki.root);
  const report = uninstall(wiki.root);
  assert.match(readFileSync(hook, 'utf8'), /foreign/);
  assert.ok(report.preserved.includes('.git/hooks/post-commit'));
  assert.ok(report.manual.some(message => /not installed by Wikipoke/.test(message)));
  assert.equal(existsSync(join(wiki.root, '.wikipoke/hooks/post-commit')), false);
});

test('uninstall is idempotent and safe on an untouched project', async () => {
  const wiki = await setup();
  install(wiki.root);
  uninstall(wiki.root);
  const report = uninstall(wiki.root);
  assert.deepEqual(report.removed, []);
  assert.ok(report.preserved.includes('wiki'));
});
test('install composes a session briefing so an agent does not open a session blind', async () => {
  const wiki = await setup();
  const report = install(wiki.root);
  assert.equal(report.activeBriefing, true);
  const settings = JSON.parse(readFileSync(join(wiki.root, '.claude/settings.json'), 'utf8'));
  assert.equal(settings.hooks.SessionStart[0].hooks[0].command, 'sh .wikipoke/hooks/session-start');
  assert.match(readFileSync(join(wiki.root, '.wikipoke/hooks/session-start'), 'utf8'), /never runs an LLM/);
  const removal = uninstall(wiki.root);
  assert.ok(removal.removed.includes('.claude/settings.json'));
  assert.ok(removal.removed.includes('.wikipoke/hooks/session-start'));
});

test('install never rewrites a settings file the project already owns', async () => {
  const wiki = await setup();
  mkdirSync(join(wiki.root, '.claude'), { recursive: true });
  writeFileSync(join(wiki.root, '.claude/settings.json'), '{ "permissions": { "allow": [] } }\n');
  const report = install(wiki.root);
  assert.equal(report.activeBriefing, false);
  assert.ok(report.manual.some(message => /session-start/.test(message)));
  assert.equal(readFileSync(join(wiki.root, '.claude/settings.json'), 'utf8'), '{ "permissions": { "allow": [] } }\n');
  uninstall(wiki.root);
  assert.equal(readFileSync(join(wiki.root, '.claude/settings.json'), 'utf8'), '{ "permissions": { "allow": [] } }\n');
});

test('the session briefing reports what the wiki owes and stays silent when clean', async () => {
  const wiki = await setup();
  install(wiki.root);
  fakeCli(wiki.root, 'exit 0');
  mkdirSync(join(wiki.root, '.wikipoke'), { recursive: true });
  writeFileSync(join(wiki.root, '.wikipoke/attention.json'), JSON.stringify({
    uncovered: { count: 244 }, drift: { count: 2 }, findings: { error: 1 }, tasks: { incomplete: 0 } }));
  const owed = spawnSync(join(wiki.root, '.wikipoke/hooks/session-start'), [], { cwd: wiki.root, encoding: 'utf8' });
  assert.match(owed.stdout, /244 undocumented source\(s\)/);
  assert.match(owed.stdout, /2 page\(s\) citing moved code/);
  assert.match(owed.stdout, /1 error finding\(s\)/);
  writeFileSync(join(wiki.root, '.wikipoke/attention.json'), JSON.stringify({
    uncovered: { count: 0 }, drift: { count: 0 }, findings: { error: 0 }, tasks: { incomplete: 0 } }));
  const clean = spawnSync(join(wiki.root, '.wikipoke/hooks/session-start'), [], { cwd: wiki.root, encoding: 'utf8' });
  assert.equal(clean.stdout, '');
  assert.equal(clean.status, 0);
});

test('the briefing pushes itself into every harness that auto-discovers a file', async () => {
  const wiki = await setup();
  const report = install(wiki.root);
  // OpenCode auto-loads .opencode/plugin/*.js and Cursor auto-loads .cursor/rules/*.mdc, so neither
  // needs a human to paste anything, and neither appears as a manual step.
  assert.ok(report.skills.includes('.opencode/plugin/wikipoke.js'));
  assert.ok(report.skills.includes('.cursor/rules/wikipoke.mdc'));
  assert.match(readFileSync(join(wiki.root, '.opencode/plugin/wikipoke.js'), 'utf8'), /experimental\.chat\.system\.transform/);
  assert.match(readFileSync(join(wiki.root, '.cursor/rules/wikipoke.mdc'), 'utf8'), /alwaysApply: true/);
  for (const harness of ['OpenCode', 'Cursor', 'Claude Code']) {
    assert.ok(report.manual.every(step => !step.startsWith(`${harness}:`)), `${harness} was pushed, so it needs no step`);
  }
  // Codex reads AGENTS.md, which the project owns, so it stays a named step.
  assert.ok(report.manual.some(step => step.startsWith('Codex:')));
  assert.ok(report.manual.some(step => /Brief the agent at session start/.test(step)));

  const removal = uninstall(wiki.root);
  assert.ok(removal.removed.includes('.opencode/plugin/wikipoke.js'));
  assert.ok(removal.removed.includes('.cursor/rules/wikipoke.mdc'));
  assert.equal(existsSync(join(wiki.root, '.opencode')), false, 'an emptied directory is not left behind');
});

test('a foreign plugin or rule of the same name is left alone', async () => {
  const wiki = await setup();
  mkdirSync(join(wiki.root, '.opencode/plugin'), { recursive: true });
  writeFileSync(join(wiki.root, '.opencode/plugin/wikipoke.js'), 'export default () => ({});\n');
  const report = install(wiki.root);
  assert.ok(report.manual.some(step => /Skipped \.opencode\/plugin\/wikipoke\.js/.test(step)));
  assert.equal(readFileSync(join(wiki.root, '.opencode/plugin/wikipoke.js'), 'utf8'), 'export default () => ({});\n');
  const removal = uninstall(wiki.root);
  assert.ok(removal.preserved.includes('.opencode/plugin/wikipoke.js'));
});
