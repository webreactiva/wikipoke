import { z } from 'zod';

// Three types, and each one earns its place by being read somewhere: `depends_on` widens the
// planning context and is checked for cycles, `supersedes` orders replacements, `related_to` is the
// symmetric catch-all. The other eight were vocabulary nothing wrote and nothing read. Everything
// else that connects two pages is a link in the body, where a reader can follow it.
export const relationSchema = z.object({
  type: z.enum(['depends_on', 'supersedes', 'related_to']),
  target: z.string().min(1), evidence: z.array(z.string()).default([]),
  basis: z.enum(['observed', 'inferred']).default('inferred'),
});
// `resource` is where the source was read from and `id` is what it is called. With a Git adapter they
// are the same string, so it is written only when it differs - a frontmatter that repeats a path
// twice teaches nothing and costs a line on every source of every page.
export const sourceSchema = z.object({
  id: z.string().min(1), resource: z.string().min(1).optional(), revision: z.string().optional(),
  hash: z.string().optional(), title: z.string().optional(),
});
export const pageSchema = z.object({
  type: z.string().min(1), title: z.string().min(1), description: z.string().default(''),
  sources: z.array(sourceSchema).default([]),
  wikipoke: z.object({ uid: z.string().min(1), relations: z.array(relationSchema).default([]) }).passthrough(),
}).passthrough();
export type Metadata = z.infer<typeof pageSchema>;
export interface Page { path: string; meta: Metadata; body: string; raw: string }
// What every command except one actually needs: the identity of a source and the digest that proves
// its content, without the content. Holding the whole scope in memory to answer "did this change"
// cost 425 MB of resident memory for 117 MB of sources on a real monorepo.
export interface SourceMeta { id: string; resource: string; revision: string; hash: string; size: number }
export interface Source extends SourceMeta { content: string }
export interface Manifest { revision: string; sources: SourceMeta[] }
export interface Inventory { revision: string; sources: Source[] }
export interface Finding { code: string; message: string; page?: string; severity: 'error' | 'warning' }
// A third party's script at a point in Wikipoke's own lifecycle. Declared in the configuration
// rather than discovered in a directory: a directory whose contents run is a directory anything can
// be dropped into, and `doctor` could never say which of those files was meant to be there.
export const extensionEvents = ['init.after', 'ingest.before', 'ingest.after', 'publish.before',
  'publish.after', 'ask.after', 'answer.after', 'capture.after', 'snapshot.after', 'seal.before',
  'seal.after', 'maintain.after'] as const;
export type ExtensionEvent = (typeof extensionEvents)[number];
export const extensionSchema = z.object({
  event: z.enum(extensionEvents),
  // A shell command, run from the project root with the event payload on stdin. A path to a script
  // is the common case and needs no special form: `./scripts/notify.sh` is already a command.
  run: z.string().min(1),
  timeout: z.number().int().positive().max(600).default(10),
  // Only a `before` event has anything left to stop. Allowed anywhere else it would read as a veto
  // that silently never fires, which is worse than not offering one.
  blocking: z.boolean().default(false),
}).superRefine((extension, ctx) => {
  if (extension.blocking && !extension.event.endsWith('.before'))
    ctx.addIssue({ code: 'custom', path: ['blocking'],
      message: `Only a .before event can refuse an action; ${extension.event} fires once it is already done` });
});
export type Extension = z.infer<typeof extensionSchema>;
export const configSchema = z.object({
  version: z.literal(1), wiki: z.string().default('wiki'), language: z.string().default('en'),
  include: z.array(z.string()).min(1), exclude: z.array(z.string()).default([]),
  // Empty by default and empty in most projects: Wikipoke does the deterministic work itself, and
  // whatever a particular team wants to happen around it is theirs to attach, not the tool's to guess.
  extensions: z.array(extensionSchema).default([]),
  limits: z.object({ batchFiles: z.number().int().positive(),
    batchBytes: z.number().int().positive().default(64 * 1024) }),
});
export type Config = z.infer<typeof configSchema>;
export const patchSchema = z.object({ pages: z.array(z.object({
  path: z.string(), meta: pageSchema, body: z.string(),
})), revision: z.string().optional(), findings: z.array(z.string()).default([]) });
export const answerSchema = z.object({ answer: z.string().min(1),
  citations: z.array(z.string()), gaps: z.array(z.string()).default([]) });
export const eventSchema = z.object({
  id: z.string().min(1), task: z.string().min(1), actor: z.string().min(1),
  at: z.string().datetime(), kind: z.enum(['open', 'decision', 'close']),
  // The choice is a paragraph and makes a terrible page name. A title is the short name for it, and
  // stays optional so a tape recorded before this field existed still parses.
  title: z.string().min(1).max(120).optional(),
  choice: z.string().optional(), rationale: z.string().optional(),
  alternatives: z.array(z.string()).default([]), evidence: z.array(z.string()).default([]),
  closure: z.enum(['recorded', 'none_declared', 'incomplete']).optional(),
}).superRefine((e, ctx) => {
  if (e.kind === 'decision' && !e.choice) ctx.addIssue({ code: 'custom', message: 'Decision needs a choice' });
  if (e.kind === 'close' && (!e.closure || (e.closure === 'none_declared' && !e.rationale)))
    ctx.addIssue({ code: 'custom', message: 'Closure and explanation required' });
});
