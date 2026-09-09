import { z } from 'zod';

export const relationSchema = z.object({
  type: z.enum(['part_of', 'depends_on', 'implements', 'motivated_by', 'supersedes',
    'contradicts', 'related_to', 'asks_about', 'answers', 'records', 'prompted_by']),
  target: z.string().min(1), evidence: z.array(z.string()).default([]),
  basis: z.enum(['observed', 'inferred']).default('inferred'),
});
export const sourceSchema = z.object({
  id: z.string().min(1), resource: z.string().min(1), revision: z.string().optional(),
  hash: z.string().optional(), title: z.string().optional(),
});
export const pageSchema = z.object({
  type: z.string().min(1), title: z.string().min(1), description: z.string().default(''),
  sources: z.array(sourceSchema).default([]),
  wikipoke: z.object({ uid: z.string().min(1), relations: z.array(relationSchema).default([]) }).passthrough(),
}).passthrough();
export type Metadata = z.infer<typeof pageSchema>;
export interface Page { path: string; meta: Metadata; body: string; raw: string }
export interface Source { id: string; resource: string; revision: string; hash: string; content: string }
export interface Inventory { revision: string; sources: Source[] }
export interface Finding { code: string; message: string; page?: string; severity: 'error' | 'warning' }
export const configSchema = z.object({
  version: z.literal(1), wiki: z.string().default('wiki'), language: z.string().default('en'),
  include: z.array(z.string()).min(1), exclude: z.array(z.string()).default([]),
  limits: z.object({ batchFiles: z.number().int().positive() }),
});
export type Config = z.infer<typeof configSchema>;
export const patchSchema = z.object({ pages: z.array(z.object({
  path: z.string(), meta: pageSchema, body: z.string(),
})), revision: z.string().optional(), findings: z.array(z.string()).default([]) });
export const answerSchema = z.object({ answer: z.string().min(1),
  citations: z.array(z.string()), gaps: z.array(z.string()).default([]) });
