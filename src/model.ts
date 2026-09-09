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
export const configSchema = z.object({
  version: z.literal(1), wiki: z.string().default('wiki'), language: z.string().default('en'),
  include: z.array(z.string()).min(1), exclude: z.array(z.string()).default([]),
  // What happens when an agent stops having touched source it never explained. `block` is the default
  // because a reminder demonstrably is not enough: given a correct notice naming all ten files it had
  // just changed, an agent finished the turn anyway and, asked why, answered "no valid excuse - I
  // focused on implementing and let the notice pass". Rationale is not skipped on purpose; it is
  // skipped because finishing the task is what has the agent's attention. `remind` tells the human
  // instead, and `off` says nothing.
  capture: z.enum(['off', 'remind', 'block']).default('block'),
  limits: z.object({ batchFiles: z.number().int().positive(),
    batchBytes: z.number().int().positive().default(64 * 1024) }),
});
export type Config = z.infer<typeof configSchema>;
export const patchSchema = z.object({ pages: z.array(z.object({
  path: z.string(), meta: pageSchema, body: z.string(),
})), revision: z.string().optional(), findings: z.array(z.string()).default([]) });
// One observed edit. Written by a harness hook the moment a tool touches a file, so it carries what
// the hook can see — never a reason, which only the agent has and only while it is still working.
export const touchSchema = z.object({
  at: z.string().min(1), file: z.string().min(1), tool: z.string().default('edit'),
  actor: z.string().default('unknown'), session: z.string().optional(),
});
export type Touch = z.infer<typeof touchSchema>;
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
