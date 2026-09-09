import { randomUUID } from 'node:crypto';
import { parse, stringify } from 'yaml';
import { configSchema, patchSchema, answerSchema, type Config, type Metadata, type Page } from './model.js';
import { index, lint, loadPages, graph, parsePage, render } from './knowledge.js';
import { Store, read, hash, json, safePath, files } from './runtime/store.js';
import { inventory, revision, git } from './sources/git.js';
import { z } from 'zod';

const eventSchema = z.object({
  id: z.string().min(1), task: z.string().min(1), actor: z.string().min(1),
  at: z.string().datetime(), kind: z.enum(['open', 'decision', 'close']),
  choice: z.string().optional(), rationale: z.string().optional(),
  alternatives: z.array(z.string()).default([]), evidence: z.array(z.string()).default([]),
  closure: z.enum(['recorded', 'none_declared', 'incomplete']).optional(),
}).superRefine((e, ctx) => {
  if (e.kind === 'decision' && !e.choice) ctx.addIssue({ code: 'custom', message: 'Decision needs a choice' });
  if (e.kind === 'close' && (!e.closure || (e.closure === 'none_declared' && !e.rationale)))
    ctx.addIssue({ code: 'custom', message: 'Closure and explanation required' });
});
type Event = z.infer<typeof eventSchema>;
const stamp = () => new Date().toISOString();
function slug(value: string): string {
  const result = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72).replace(/-+$/g, '');
  return result || 'record';
}
function namedPath(directory: string, label: string, identity: string): string {
  return `${directory}/${slug(label)}-${hash(identity).slice(0, 8)}.md`;
}
function metadata(type: string, title: string, uid: string): Metadata {
  return { type, title, description: title, sources: [], wikipoke: { uid, relations: [] } };
}
export class Wiki {
  readonly store: Store;
  readonly config: Config;
  constructor(readonly root: string) {
    this.store = new Store(root);
    const config = read(this.store.path('wikipoke.config.yaml'));
    if (!config) throw new Error('Run init first');
    this.config = configSchema.parse(parse(config));
    safePath(root, this.config.wiki);
  }
  static async init(root: string, input: Config) {
    let config = configSchema.parse(input), store = new Store(root);
    safePath(root, config.wiki);
    await store.locked(() => {
      const existing = read(store.path('wikipoke.config.yaml'));
      if (existing) throw new Error('Configuration already exists; edit it explicitly');
      const indexPath = `${config.wiki}/index.md`, existingIndex = read(store.path(indexPath));
      if (existingIndex !== null && existingIndex !== '# Knowledge index\n')
        throw new Error(`Wiki already exists at ${indexPath}; migrate it explicitly instead of initializing over it`);
      const ignoreFile = read(store.path('.wikipokeignore'));
      if (ignoreFile !== null) {
        const adopted = ignoreFile.split(/\r?\n/).map(line => line.trim())
          .filter(line => line.length > 0 && !line.startsWith('#'));
        config = { ...config, exclude: [...new Set([...config.exclude, ...adopted])] };
      }
      store.commit([{ path: 'wikipoke.config.yaml', before: null, after: stringify(config) },
        { path: indexPath, before: existingIndex, after: '# Knowledge index\n' },
        { path: '.wikipoke/state.json', before: null, after: json({ version: 1, lastIndexedCommit: null }) }]);
    });
    return new Wiki(root);
  }
  pages() { return loadPages(this.store.path(this.config.wiki)); }
  pagePath(path: string) {
    if (!path.endsWith('.md') || ['index.md', 'log.md'].includes(path)) throw new Error(`Invalid concept path: ${path}`);
    safePath(this.store.path(this.config.wiki), path);
    const parts = path.slice(0, -3).split('/');
    if (parts.some(part => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part)))
      throw new Error(`Wiki path needs readable slug segments: ${path}`);
    return `${this.config.wiki}/${path}`;
  }
  private publish(pages: Page[], extra: { path: string; before: string | null; after: string }[] = []) {
    const existing = this.pages(), byPath = new Map(existing.map(p => [p.path, p]));
    for (const p of pages) { this.pagePath(p.path); byPath.set(p.path, p); }
    const errors = lint([...byPath.values()]).filter(f => f.severity === 'error');
    if (errors.length) throw new Error(json(errors));
    const writes = pages.map(p => ({ path: this.pagePath(p.path), before: read(this.store.path(this.pagePath(p.path))),
      after: render(p.meta, p.body) }));
    const idx = `${this.config.wiki}/index.md`;
    writes.push({ path: idx, before: read(this.store.path(idx)), after: index([...byPath.values()]) });
    this.store.commit([...writes, ...extra].filter(w => w.before !== w.after));
  }
  async status() {
    return this.store.locked(() => this.health());
  }
  async lint() {
    return this.store.locked(() => lint(this.pages()));
  }
  private health() {
    const inv = inventory(this.root, this.config), pages = this.pages();
    const current = new Map(inv.sources.map(s => [s.id, s]));
    const covered = new Set(pages.filter(p => !['query', 'watchlog'].includes(p.meta.type))
      .flatMap(p => p.meta.sources.filter(s => s.hash === current.get(s.id)?.hash).map(s => s.id)));
    const drift = pages.flatMap(p => p.meta.sources.filter(s => s.hash && s.hash !== current.get(s.id)?.hash)
      .map(s => ({ page: p.path, source: s.id, reason: current.has(s.id) ? 'changed' : 'missing' })));
    const events = this.events();
    const tasks = [...new Set(events.map(e => e.task))].map(task => {
      const list = events.filter(e => e.task === task), closed = [...list].reverse().find(e => e.kind === 'close');
      const hasDecision = list.some(e => e.kind === 'decision');
      const closure = !list.some(e => e.kind === 'open') || !closed ||
        (closed.closure === 'recorded' && !hasDecision) || (closed.closure === 'none_declared' && hasDecision)
        ? 'incomplete' : closed.closure;
      return { task, closure };
    });
    return { revision: inv.revision, checkpoint: this.store.load('.wikipoke/state.json', { version: 1, lastIndexedCommit: null }), pages: pages.length, findings: lint(pages), drift,
      uncovered: inv.sources.filter(s => !covered.has(s.id)).map(s => s.id), tasks,
      graph: graph(pages) };
  }
  async ingest(ref = 'HEAD') {
    return this.store.locked(() => {
      const inv = inventory(this.root, this.config, ref), existing = this.pages();
      const documented = new Set(existing.filter(p => !['query', 'watchlog'].includes(p.meta.type))
        .flatMap(p => p.meta.sources.filter(s => inv.sources.some(c => c.id === s.id && c.hash === s.hash)).map(s => s.id)));
      const sources = inv.sources.filter(s => !documented.has(s.id)).slice(0, this.config.limits.batchFiles);
      const sourceIds = new Set(sources.map(s => s.id));
      const direct = new Set(existing.filter(p => p.meta.sources.some(s => sourceIds.has(s.id))).map(p => p.path));
      for (const edge of graph(existing).edges) if (['depends_on', 'implements'].includes(edge.type) && direct.has(edge.to)) direct.add(edge.from);
      return { complete: sources.length === 0, language: this.config.language, revision: inv.revision, sources,
        pages: existing.filter(p => direct.has(p.path)), catalog: existing.map(p => ({ path: p.path, title: p.meta.title })) };
    });
  }
  async publishPatch(input: unknown, ref = 'HEAD') {
    const output = patchSchema.parse(input);
    return this.store.locked(() => {
      const inv = inventory(this.root, this.config, ref), existing = this.pages(), base = new Map(existing.map(p => [p.path, p.raw]));
      if (revision(this.root, ref) !== inv.revision) throw new Error('Source revision changed before publication; plan again');
      const allowed = new Map(inv.sources.map(s => [s.id, s]));
      const updated = output.pages.map(p => {
        this.pagePath(p.path);
        if (['query', 'watchlog'].includes(p.meta.type)) throw new Error('Publish cannot replace captured history');
        if (read(this.store.path(this.pagePath(p.path))) !== (base.get(p.path) ?? null)) throw new Error(`Concurrent edit: ${p.path}`);
        const old = existing.find(e => e.path === p.path);
        if (old && old.meta.wikipoke.uid !== p.meta.wikipoke.uid) throw new Error('Cannot replace page identity');
        for (const source of p.meta.sources) {
          const known = allowed.get(source.id);
          if (!known || known.resource !== source.resource || known.hash !== source.hash || known.revision !== source.revision)
            throw new Error(`Unverified source: ${source.id}`);
        }
        return { ...p, raw: render(p.meta, p.body) };
      });
      if (!updated.length) throw new Error('Patch contains no pages');
      this.publish(updated);
      return { published: updated.map(p => p.path), findings: output.findings };
    });
  }
  async ask(question: string, requestId = randomUUID(), ref?: string) {
    const id = hash(requestId), path = namedPath('queries', question, requestId);
    return this.store.locked(async () => {
      const before = this.pages().find(p => p.meta.type === 'query' &&
        (p.meta.wikipoke.query as Record<string, unknown> | undefined)?.requestId === requestId);
      if (before) {
        const record = before.meta.wikipoke.query as Record<string, unknown>;
        if (record.question !== question || record.ref !== (ref ?? 'HEAD')) throw new Error('Request ID already used for different input');
        if (record.state === 'answered') return record;
      }
      const at = stamp(), meta = metadata('query', question, `query:${id}`);
      meta.wikipoke.query = { requestId, question, ref: ref ?? 'HEAD', at, state: 'pending', attempts: before ?
        [...((before.meta.wikipoke.query as any).attempts ?? []), { at, state: 'pending' }] : [{ at, state: 'pending' }] };
      this.publish([{ path, meta, body: `# Question\n\n${question}\n`, raw: '' }]);
      const inv = inventory(this.root, this.config, ref), pages = this.pages().filter(p => p.meta.type !== 'query');
      const tokens = question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
      const suggestedPages = pages.map(p => ({ path: p.path, score: tokens.reduce((n, t) => n + Number(`${p.meta.title} ${p.body}`.toLowerCase().includes(t)), 0) }))
        .sort((a, b) => b.score - a.score).slice(0, 6).map(p => p.path);
      return { ...(meta.wikipoke.query as object), path, revision: inv.revision, suggestedPages };
    });
  }
  async answer(requestId: string, input: unknown) {
    const answer = answerSchema.parse(input);
    return this.store.locked(() => {
      const page = this.pages().find(p => p.meta.type === 'query' && (p.meta.wikipoke.query as any)?.requestId === requestId);
      if (!page) throw new Error('Unknown query request ID');
      const query = page.meta.wikipoke.query as Record<string, unknown>;
      const inv = inventory(this.root, this.config, query.ref as string);
      const citations = answer.citations.map(id => {
        const source = inv.sources.find(s => s.id === id);
        if (!source) throw new Error(`Unknown citation: ${id}`);
        const { content, ...evidence } = source; return evidence;
      });
      const meta = page.meta;
      meta.sources = citations;
      meta.wikipoke.query = { ...query, ...answer, revision: inv.revision, state: 'answered', completedAt: stamp() };
      this.publish([{ path: page.path, meta, body: `# Question\n\n${query.question}\n\n# Answer\n\n${answer.answer}\n\n# Gaps\n\n${answer.gaps.join('\n')}\n`, raw: '' }]);
      return meta.wikipoke.query;
    });
  }
  events(): Event[] {
    return files(this.store.path('.wikipoke/events')).filter(f => f.endsWith('.json'))
      .map(f => eventSchema.parse(JSON.parse(read(f)!))).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }
  async capture(input: unknown) {
    const event = eventSchema.parse(input), eventPath = `.wikipoke/events/${hash(event.id)}.json`;
    return this.store.locked(() => {
      const old = read(this.store.path(eventPath));
      if (old && old !== json(event)) throw new Error('Event ID already exists with different content');
      if (!old) this.store.commit([{ path: eventPath, before: null, after: json(event) }]);
      const events = this.events().filter(e => e.task === event.task), taskId = hash(event.task);
      const log = metadata('watchlog', event.task, `task:${taskId}`);
      const decisions = events.filter(e => e.kind === 'decision').map(e => {
        const decisionPath = namedPath('decisions', e.choice!, e.id), meta = metadata('decision', e.choice!, `decision:${hash(e.id)}`);
        const existing = this.pages().find(p => p.path === decisionPath);
        if (existing) return existing;
        meta.wikipoke.decision = { state: 'proposed', actor: e.actor, eventId: e.id, at: e.at, conformance: 'unknown' };
        return { path: decisionPath, meta, raw: '', body: `# Choice\n\n${e.choice}\n\n# Declared rationale\n\n${e.rationale ?? 'Unknown; not declared.'}\n\n# Alternatives\n\n${e.alternatives.join('\n')}\n\n# Declared evidence (not yet verified)\n\n${e.evidence.join('\n')}\n` };
      });
      log.wikipoke.relations = decisions.map(p => ({ type: 'records', target: '/' + p.path, evidence: [], basis: 'observed' }));
      this.publish([...decisions, { path: namedPath('watchlogs', event.task, event.task), meta: log, raw: '',
        body: '# Recorded events\n\n' + events.map(e => `## ${e.at} - ${e.kind}\n\nActor: ${e.actor}\n\n${e.choice ?? e.closure ?? 'Task opened'}\n\n${e.rationale ?? ''}\n`).join('\n') }]);
      return { id: event.id, task: event.task, materialized: true };
    });
  }
  async snapshot(label: string, ref = 'HEAD') {
    return this.store.locked(() => {
      const code = revision(this.root, ref), wiki = revision(this.root);
      const dirty = git(this.root, 'status', '--porcelain', '--', this.config.wiki);
      if (dirty.trim()) throw new Error('Commit wiki changes before a snapshot');
      const tree = git(this.root, 'ls-tree', '-r', '--name-only', wiki, '--', this.config.wiki);
      if (!tree.trim()) throw new Error('Snapshot requires committed wiki content');
      const name = hash(label), dest = `.wikipoke/releases/${name}.json`;
      if (read(this.store.path(dest))) throw new Error('Release label already captured');
      git(this.root, 'update-ref', `refs/wikipoke/${name}/code`, code);
      git(this.root, 'update-ref', `refs/wikipoke/${name}/wiki`, wiki);
      const manifest = { label, code, wiki, at: stamp(), health: this.health() };
      this.store.commit([{ path: dest, before: null, after: json(manifest) }]);
      return manifest;
    });
  }
  async seal(ref = 'HEAD') {
    return this.store.locked(() => {
      const health = this.health(), commit = revision(this.root, ref);
      if (health.drift.length || health.uncovered.length || health.findings.some(f => f.severity === 'error'))
        throw new Error('Cannot advance checkpoint while wiki health has pending work');
      const state = { version: 1, lastIndexedCommit: commit, sealedAt: stamp() };
      const path = '.wikipoke/state.json';
      this.store.commit([{ path, before: read(this.store.path(path)), after: json(state) }]);
      return state;
    });
  }
}
