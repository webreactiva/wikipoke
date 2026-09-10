import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, chmodSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { Wiki } from '../src/wiki.js';
import { install, uninstall, skillState } from '../src/integrations.js';
import type { Config } from '../src/model.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const cliSource = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
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
// The refresh is detached so the commit does not wait for it, which is the whole point; a test that
// wants to see its effect has to wait where the commit does not. The budget is generous on purpose:
// it returns the moment the file appears, so a large one costs nothing when the machine is idle and
// is the difference between asserting "this eventually runs" and "this machine is fast today".
async function settled(path: string, within = 30000): Promise<string | null> {
  for (const started = Date.now(); Date.now() - started < within;) {
    const seen = readFileSyncOrNull(path);
    if (seen !== null) return seen;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return readFileSyncOrNull(path);
}
function readFileSyncOrNull(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
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
  assert.equal((await settled(join(wiki.root, '.wikipoke/invocation')))?.trim(),
    `--root ${realpathSync(wiki.root)} maintain --once`);
});

test('the notifier refreshes the signal through maintain --once', async () => {
  const wiki = await setup();
  install(wiki.root);
  // The refresh is made deliberately slow, because the property under test is that the hook does not
  // wait for it - not that a particular machine can fork a shell inside some number of milliseconds.
  // A wall-clock budget measured the second thing and failed wherever the first one still held.
  const refresh = 3000;
  fakeCli(wiki.root, `sleep ${refresh / 1000}\nprintf "%s\\n" "$*" > "$2/.wikipoke/invocation"\nprintf "{\\"refreshed\\":true}\\n" > "$2/.wikipoke/attention.json"`);
  const started = Date.now();
  const result = notify(wiki.root);
  const waited = Date.now() - started;
  // The commit must not wait for a pass that reads every source in the repository.
  assert.ok(waited < refresh, `hook waited ${waited}ms for a ${refresh}ms refresh`);
  assert.equal(result.status, 0);
  assert.equal((await settled(join(wiki.root, '.wikipoke/invocation')))?.trim(),
    `--root ${realpathSync(wiki.root)} maintain --once`);
  assert.equal(await settled(join(wiki.root, '.wikipoke/attention.json')), '{"refreshed":true}\n');
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
    uncovered: { count: 244 }, drift: { count: 2 }, findings: { error: 1 } }));
  const owed = spawnSync(join(wiki.root, '.wikipoke/hooks/session-start'), [], { cwd: wiki.root, encoding: 'utf8' });
  assert.match(owed.stdout, /244 undocumented source\(s\)/);
  assert.match(owed.stdout, /2 page\(s\) citing moved code/);
  assert.match(owed.stdout, /1 error finding\(s\)/);
  writeFileSync(join(wiki.root, '.wikipoke/attention.json'), JSON.stringify({
    uncovered: { count: 0 }, drift: { count: 0 }, findings: { error: 0 } }));
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

test('the OpenCode briefing refreshes from the signal instead of freezing at startup', async () => {
  const wiki = await setup();
  install(wiki.root);
  fakeCli(wiki.root, `cd "${repoRoot}" && exec "${process.execPath}" --import tsx "${cliSource}" "$@"`);
  const plugin = await import(join(wiki.root, '.opencode/plugin/wikipoke.js') + '?fresh');
  const hooks = await plugin.wikipoke({ directory: wiki.root });
  const say = async () => { const out: any = { system: [] };
    await hooks['experimental.chat.system.transform']({ sessionID: 'oc-brief' }, out); return out.system.join(' '); };
  const first = await say();
  assert.match(first, /undocumented source/);
  // Debt that appears mid-session — a missing flow only becomes reportable once pages exist — has to
  // reach an agent that never restarts. The startup briefing alone could never say this.
  await new Wiki(wiki.root).attention();
  writeFileSync(join(wiki.root, '.wikipoke/attention.json'), JSON.stringify({
    uncovered: { count: 0 }, flows: { count: 0, missing: true }, findings: { error: 0 } }));
  assert.match(await say(), /no flow page/);
});

test('every generated hook is a syntactically valid shell script', async () => {
  const wiki = await setup();
  install(wiki.root);
  // A backtick in a message is valid shell that runs a command; `sh -n` accepts it happily and the
  // text arrives mangled, or worse, executed. Neither belongs in a message.
  for (const hook of ['post-commit', 'session-start']) {
    const script = readFileSync(join(wiki.root, '.wikipoke/hooks', hook), 'utf8');
    for (const line of script.split('\n').filter(l => /^\s*echo /.test(l)))
      assert.equal(/[`$]\(/.test(line) || line.includes('`'), false, `${hook}: ${line}`);
  }
  // These scripts embed a node program inside single quotes, so one apostrophe in a message ends the
  // quoting and the hook dies at run time with a syntax error nobody would see until it mattered.
  for (const hook of ['post-commit', 'session-start']) {
    const checked = spawnSync('sh', ['-n', join(wiki.root, '.wikipoke/hooks', hook)], { encoding: 'utf8' });
    assert.equal(checked.status, 0, `${hook}: ${checked.stderr}`);
  }
});

test('install keeps the writer lock out of every commit', async () => {
  const wiki = await setup();
  install(wiki.root);
  const ignored = readFileSync(join(wiki.root, '.gitignore'), 'utf8');
  assert.match(ignored, /\.wikipoke\/write\.lock\//);
  assert.match(ignored, /\.wikipoke\/transaction\.json/);
  // Scratch files belong inside the project: /tmp is a sandbox boundary in most harnesses, and a
  // permission prompt for a temporary plan file is a poor way to spend a human's attention.
  assert.match(ignored, /\.wikipoke\/tmp\//);
  for (const skill of ['wikipoke-ingest', 'wikipoke-query', 'wikipoke-decision']) {
    const text = readFileSync(join(wiki.root, '.claude/skills', skill, 'SKILL.md'), 'utf8');
    assert.match(text, /\.wikipoke\/tmp\//, skill);
  }
  // `git add -A` is the habit, because the post-commit hook dirties the tree on every commit. What
  // it must never pick up is the lock: a clone of that commit is locked from birth and silent.
  mkdirSync(join(wiki.root, '.wikipoke/write.lock'), { recursive: true });
  writeFileSync(join(wiki.root, '.wikipoke/write.lock/owner.json'), '{"pid":1}');
  execFileSync('git', ['-C', wiki.root, 'add', '-A']);
  const staged = execFileSync('git', ['-C', wiki.root, 'diff', '--cached', '--name-only'], { encoding: 'utf8' });
  assert.equal(/write\.lock/.test(staged), false);
  // Knowledge in the same directory still travels.
  assert.match(staged, /\.wikipoke\/state\.json/);
  install(wiki.root);
  assert.equal(readFileSync(join(wiki.root, '.gitignore'), 'utf8'), ignored);
});

test('a broken wiki says so, instead of printing what a healthy one prints', async () => {
  const wiki = await setup();
  install(wiki.root);
  fakeCli(wiki.root, 'exit 0');
  const brief = () => execFileSync('sh', [join(wiki.root, '.wikipoke/hooks/session-start')],
    { cwd: wiki.root, encoding: 'utf8' }).trim();

  mkdirSync(join(wiki.root, '.wikipoke/write.lock'), { recursive: true });
  // Silence used to mean both "nothing owed" and "nothing works". Now it means only the first.
  assert.match(brief(), /writer lock is held/);
  assert.match(brief(), /recover --unlock/);

  rmSync(join(wiki.root, '.wikipoke/write.lock'), { recursive: true });
  assert.equal(brief(), '');
});

// Upgrading a project that still carries the edit hook and the stop hook from an older release. Both
// were written by Wikipoke and are no longer installed, so leaving them on disk would leave them
// running against a CLI that no longer has the command they call.
test('install retires the automatic capture hooks an older release left behind', async () => {
  const wiki = await setup();
  const legacy = `${JSON.stringify({
    hooks: {
      SessionStart: [{ matcher: 'startup|resume', hooks: [{ type: 'command', command: 'sh .wikipoke/hooks/session-start', timeout: 20 }] }],
      PostToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [{ type: 'command', command: 'sh .wikipoke/hooks/tool-journal', timeout: 10 }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'sh .wikipoke/hooks/session-stop', timeout: 30 }] }],
    },
  }, null, 2)}\n`;
  mkdirSync(join(wiki.root, '.wikipoke/hooks'), { recursive: true });
  mkdirSync(join(wiki.root, '.claude'), { recursive: true });
  writeFileSync(join(wiki.root, '.wikipoke/hooks/tool-journal'), '#!/bin/sh\nexit 0\n');
  writeFileSync(join(wiki.root, '.wikipoke/hooks/session-stop'), '#!/bin/sh\nexit 0\n');
  writeFileSync(join(wiki.root, '.claude/settings.json'), legacy);

  const report = install(wiki.root);
  assert.equal(existsSync(join(wiki.root, '.wikipoke/hooks/tool-journal')), false);
  assert.equal(existsSync(join(wiki.root, '.wikipoke/hooks/session-stop')), false);
  assert.ok(report.manual.some(step => step.includes('docs/extensions.md')));
  const settings = JSON.parse(readFileSync(join(wiki.root, '.claude/settings.json'), 'utf8'));
  // The retired hooks are gone; the surviving Stop hook is the briefing itself, which prints and
  // never refuses a stop - the opposite of the one an older release wired here.
  assert.deepEqual(Object.keys(settings.hooks), ['SessionStart', 'Stop']);
  assert.equal(settings.hooks.Stop[0].hooks[0].command, 'sh .wikipoke/hooks/session-start');
  assert.equal(report.activeBriefing, true);
});

// The same file, once a human has touched it. Wikipoke wrote the hooks but no longer owns the file,
// so it says what to remove instead of editing around whatever else is in there.
test('a settings file Wikipoke no longer recognises is named, not rewritten', async () => {
  const wiki = await setup();
  const theirs = JSON.stringify({ permissions: { allow: ['Bash(ls:*)'] }, hooks: {
    SessionStart: [{ matcher: 'startup|resume', hooks: [{ type: 'command', command: 'sh .wikipoke/hooks/session-start' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'sh .wikipoke/hooks/session-stop' }] }],
  } }, null, 2);
  mkdirSync(join(wiki.root, '.claude'), { recursive: true });
  writeFileSync(join(wiki.root, '.claude/settings.json'), theirs);
  const report = install(wiki.root);
  assert.equal(readFileSync(join(wiki.root, '.claude/settings.json'), 'utf8'), theirs);
  assert.ok(report.manual.some(step => step.includes('session-stop') && step.includes('by hand')));
});

test('a skill file left by an older release is reported, not left to mislead an agent', async () => {
  const wiki = await setup();
  install(wiki.root);
  const skill = join(wiki.root, '.claude/skills/wikipoke-ingest/SKILL.md');
  const current = readFileSync(skill, 'utf8');
  assert.match(current, /<!-- managed by wikipoke \d+\.\d+\.\d+; do not edit this line -->/);
  // The skill text is the first thing an agent reads. A copy from an earlier release parses, reads
  // as authoritative, and names commands this build does not have - and nothing about reading it
  // says so, which is why it has to be stamped and checked rather than trusted.
  writeFileSync(skill, current.replace(/managed by wikipoke [^;]+;/, 'managed by wikipoke 0.0.1;'));
  const stale = skillState(wiki.root).filter(s => !s.current);
  assert.deepEqual(stale.map(s => s.path), ['.claude/skills/wikipoke-ingest/SKILL.md']);

  // install replaces it: recognition uses the version-less prefix, so a file any release wrote is
  // still ours to take back.
  install(wiki.root);
  assert.deepEqual(skillState(wiki.root).filter(s => !s.current), []);
  assert.equal(readFileSync(skill, 'utf8'), current);
});
