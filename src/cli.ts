#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { parse } from 'yaml';
import { Wiki } from './wiki.js';
import { configSchema } from './model.js';
import { answerSchema, patchSchema } from './model.js';
import { z } from 'zod';
import { hookActive, install } from './integrations.js';

const program = new Command();
program.name('wikipoke').description('Maintain versioned, connected knowledge from project sources')
  .option('--root <path>', 'project root', process.cwd()).option('--json', 'emit JSON');
function root() { return resolve(program.opts().root); }
function output(value: unknown) { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }
function fail(error: unknown) { process.stderr.write(`${(error as Error).message}\n`); process.exitCode = 1; }
program.command('init').description('create an explicit configuration and empty wiki')
  .requiredOption('--include <glob...>', 'source glob(s)')
  .option('--wiki <path>', 'wiki path', 'wiki').option('--language <language>', 'knowledge language', 'en')
  .option('--exclude <glob...>', 'source glob(s) to exclude', [])
  .action(async options => { try {
    const input = configSchema.parse({ version: 1, wiki: options.wiki, language: options.language,
      include: options.include, exclude: options.exclude,
      limits: { batchFiles: 10 } });
    await Wiki.init(root(), input); output({ initialized: true, config: 'wikipoke.config.yaml' });
  } catch (error) { fail(error); } });
for (const [name, description, action] of [
  ['status', 'report health and pending work', async (wiki: Wiki) => wiki.status()],
  ['lint', 'validate wiki structure without an LLM', async (wiki: Wiki) => wiki.lint()],
  ['graph', 'emit a reconstructable graph', async (wiki: Wiki) => (await wiki.status()).graph],
  ['ingest', 'bootstrap or reconcile source knowledge', async (wiki: Wiki, options: { ref?: string }) => wiki.ingest(options.ref)],
  ['maintain', 'run one automatic reconciliation pass', async (wiki: Wiki, options: { once?: boolean }) => wiki.ingest()],
] as const) {
  const command = program.command(name).description(description);
  if (name === 'ingest') command.option('--ref <commit>', 'source commit', 'HEAD');
  if (name === 'maintain') command.requiredOption('--once', 'perform one bounded maintenance pass');
  command.action(async (options: any) => { try { output(await action(new Wiki(root()), options)); } catch (error) { fail(error); } });
}
program.command('ask <question>').description('open and preserve a query for an agent to research')
  .option('--request-id <id>', 'stable request identity').option('--ref <commit>', 'historical source commit')
  .action(async (question, options) => { try { output(await new Wiki(root()).ask(question, options.requestId, options.ref)); } catch (error) { fail(error); } });
program.command('answer').description('validate and persist an agent-researched query answer')
  .requiredOption('--request-id <id>', 'query request identity').requiredOption('--response <file>', 'answer JSON file')
  .action(async options => { try { output(await new Wiki(root()).answer(options.requestId, JSON.parse(readFileSync(options.response, 'utf8')))); } catch (error) { fail(error); } });
program.command('publish').description('validate and publish an agent-authored wiki patch')
  .requiredOption('--patch <file>', 'patch JSON file').option('--ref <commit>', 'source commit', 'HEAD')
  .action(async options => { try { output(await new Wiki(root()).publishPatch(JSON.parse(readFileSync(options.patch, 'utf8')), options.ref)); } catch (error) { fail(error); } });
program.command('schema <kind>').description('emit the JSON schema for an agent-authored payload')
  .action((kind: string) => { try {
    if (kind === 'patch') output(z.toJSONSchema(patchSchema));
    else if (kind === 'answer') output(z.toJSONSchema(answerSchema));
    else throw new Error('Schema kind must be patch or answer');
  } catch (error) { fail(error); } });
program.command('capture').description('persist and materialize a task event')
  .requiredOption('--event <file>', 'event JSON file')
  .action(async options => { try { output(await new Wiki(root()).capture(JSON.parse(readFileSync(options.event, 'utf8')))); } catch (error) { fail(error); } });
program.command('snapshot <label>').description('capture exact code and wiki revisions')
  .option('--ref <commit>', 'code commit', 'HEAD')
  .action(async (label, options) => { try { output(await new Wiki(root()).snapshot(label, options.ref)); } catch (error) { fail(error); } });
program.command('seal').description('advance the Git checkpoint after complete reconciliation')
  .option('--ref <commit>', 'code commit', 'HEAD')
  .action(async options => { try { output(await new Wiki(root()).seal(options.ref)); } catch (error) { fail(error); } });
program.command('install').description('install agent-neutral skills and a composable hook')
  .action(() => { try { output(install(root())); } catch (error) { fail(error); } });
program.command('doctor').description('report configured capabilities')
  .action(async () => { try { const wiki = new Wiki(root()), status = await wiki.status(); output({ node: process.version,
    hook: '.wikipoke/hooks/post-commit', hookComposed: hookActive(root()), pending: status.uncovered.length + status.drift.length });
  } catch (error) { fail(error); } });
program.parseAsync().catch(fail);
