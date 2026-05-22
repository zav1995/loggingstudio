// TypeScript-side mirror of shared/parser-schema.json. This is the source of
// truth for the parser shape inside the frontend; changes to the JSON Schema
// must be reflected here in the same PR.

import { z } from 'zod';

export const filterRuleSchema = z.object({
  path: z.string().min(1),
  op: z.enum(['eq', 'neq', 'contains', 'matches']),
  value: z.string(),
});
export type FilterRule = z.infer<typeof filterRuleSchema>;

// The mapping-rule grammar is recursive because of lower/trim/regex_extract/
// concat wrapping nested rules. We declare the TS type and the schema together
// with z.lazy so each side knows about the other.

export type MappingRule =
  | { type: 'literal'; value: unknown }
  | { type: 'xpath'; path: string }
  | { type: 'jsonpath'; path: string }
  | { type: 'timecode_to_ms'; path: string; minus_ms?: number; plus_ms?: number }
  | { type: 'tag_lookup_by_name'; path: string }
  | { type: 'lower'; value: MappingRule }
  | { type: 'trim'; value: MappingRule }
  | { type: 'regex_extract'; value: MappingRule; pattern: string; group?: number }
  | { type: 'concat'; parts: MappingRule[]; separator?: string };

export const mappingRuleSchema: z.ZodType<MappingRule> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('literal'), value: z.unknown() }),
    z.object({ type: z.literal('xpath'), path: z.string().min(1) }),
    z.object({ type: z.literal('jsonpath'), path: z.string().min(1) }),
    z.object({
      type: z.literal('timecode_to_ms'),
      path: z.string().min(1),
      minus_ms: z.number().int().nonnegative().optional(),
      plus_ms: z.number().int().nonnegative().optional(),
    }),
    z.object({ type: z.literal('tag_lookup_by_name'), path: z.string().min(1) }),
    z.object({ type: z.literal('lower'), value: mappingRuleSchema }),
    z.object({ type: z.literal('trim'), value: mappingRuleSchema }),
    z.object({
      type: z.literal('regex_extract'),
      value: mappingRuleSchema,
      pattern: z.string().min(1),
      group: z.number().int().nonnegative().optional(),
    }),
    z.object({
      type: z.literal('concat'),
      parts: z.array(mappingRuleSchema).min(1),
      separator: z.string().optional(),
    }),
  ]),
);

export const parserSchema = z.object({
  match: z.literal('Log'),
  filters: z.array(filterRuleSchema).default([]),
  mapping: z.object({
    offset_in: mappingRuleSchema,
    offset_out: mappingRuleSchema.optional(),
    tags: mappingRuleSchema,
    source: mappingRuleSchema,
  }),
  tag_lookup_mode: z.enum(['strict', 'lenient']).default('lenient'),
});
export type Parser = z.infer<typeof parserSchema>;
