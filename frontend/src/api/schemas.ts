// Zod schemas mirroring the backend domain (PRD §2). Inferred types are the
// canonical TS types for the rest of the app.

import { z } from 'zod';

export const healthSchema = z.object({
  ok: z.boolean(),
  db: z.string(),
  ts: z.string(),
});
export type Health = z.infer<typeof healthSchema>;

export const mediaSchema = z.object({
  id: z.string().min(1),
  hls_url: z.string().url(),
  started_at_tc: z.string(),
  frame_rate: z.number().int().min(1).max(120),
  label: z.string().optional(),
  created_at: z.string().optional(),
});
export type Media = z.infer<typeof mediaSchema>;

export const tagGroupSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  color: z.string(),
  display_order: z.number().int().default(0),
  created_at: z.string().optional(),
});
export type TagGroup = z.infer<typeof tagGroupSchema>;

export const tagSchema = z.object({
  id: z.string().uuid().optional(),
  group_id: z.string().uuid(),
  name: z.string().min(1),
  hotkey: z.string().nullable().optional(),
  display_order: z.number().int().default(0),
  created_at: z.string().optional(),
});
export type Tag = z.infer<typeof tagSchema>;

export const sessionSchema = z.object({
  id: z.string().uuid().optional(),
  media_id: z.string(),
  name: z.string().min(1),
  started_at: z.string().optional(),
  ended_at: z.string().nullable().optional(),
  notes: z.string().optional(),
});
export type Session = z.infer<typeof sessionSchema>;

export const logSchema = z.object({
  id: z.string().uuid().optional(),
  media_id: z.string(),
  offset_in: z.number().int().nonnegative(),
  offset_out: z.number().int().nullable().optional(),
  tags: z.array(z.string().uuid()).default([]),
  source: z.string().min(1),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type Log = z.infer<typeof logSchema>;

export const ingestParserSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  source_format: z.enum(['xml', 'json']),
  sample_payload: z.string(),
  // mapping + filter are validated separately by the parser schema in
  // src/lib/parser-schema.ts because they're not flat scalars.
  mapping: z.unknown(),
  filter: z.unknown().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type IngestParser = z.infer<typeof ingestParserSchema>;
