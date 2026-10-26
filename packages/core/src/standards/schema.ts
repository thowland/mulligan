import { z } from 'zod';
import { isChangeRule } from '../findings/catalog.ts';

const id = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, 'must be lowercase kebab-case');
const positiveInt = z.number().int().positive();
const hexColour = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'must be a #RRGGBB colour');
const pattern = z.string().refine(isValidPattern, 'must be a valid regular expression');

const anchorAxisX = z.enum(['left', 'center', 'right']);
const anchorAxisY = z.enum(['top', 'center', 'bottom']);
const anchor = z.union([
  z.enum(['top', 'center']),
  z.strictObject({ x: anchorAxisX, y: anchorAxisY }),
]);

const store = z.strictObject({ id, label: z.string().min(1) });

const group = z.strictObject({
  id,
  label: z.string().min(1),
  anchor,
  maxFiles: positiveInt,
});

const preset = z
  .strictObject({
    id,
    name: z.string().min(1),
    store: id,
    group: id,
    width: positiveInt,
    height: positiveInt,
    format: z.enum(['png', 'jpeg']),
    jpegQuality: z.number().gt(0).lte(1).optional(),
    alpha: z.boolean(),
    flatten: hexColour.default('#FFFFFF'),
    anchor: anchor.optional(),
    folder: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, 'must be a safe folder name'),
    fileSuffix: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase kebab-case')
      .optional(),
    maxBytes: positiveInt.optional(),
    count: z.strictObject({ min: z.number().int().nonnegative(), max: positiveInt }),
    defaultSelected: z.boolean(),
    note: z.string().optional(),
  })
  .refine((p) => p.count.min <= p.count.max, {
    message: 'count.min must not exceed count.max',
    path: ['count'],
  })
  .refine((p) => p.format === 'jpeg' || p.jpegQuality === undefined, {
    message: 'jpegQuality applies only to jpeg presets',
    path: ['jpegQuality'],
  })
  .refine((p) => !(p.format === 'jpeg' && p.alpha), {
    message: 'jpeg cannot carry alpha',
    path: ['alpha'],
  });

const field = z
  .strictObject({
    id,
    store: id,
    label: z.string().min(1),
    limit: z.strictObject({
      max: positiveInt,
      min: positiveInt.optional(),
      unit: z.enum(['chars', 'bytes']),
    }),
    multiline: z.boolean(),
    required: z.boolean(),
    kind: z.enum(['text', 'keywords']),
    checks: z.array(z.enum(['discouraged'])).default([]),
    related: z.array(id).default([]),
    options: z.strictObject({ straightQuotes: z.boolean() }).default({ straightQuotes: false }),
    note: z.string().optional(),
  })
  .refine((f) => f.limit.min === undefined || f.limit.min <= f.limit.max, {
    message: 'limit.min must not exceed limit.max',
    path: ['limit'],
  });

const rules = z.strictObject({
  counting: z.strictObject({ chars: z.enum(['utf16', 'codepoints', 'graphemes']) }),
  emoji: z.strictObject({ preserve: z.array(z.string().min(1)) }),
  lists: z.strictObject({
    bullet: z.string().min(1),
    orderedStyle: z.enum(['number', 'dash']),
  }),
  rejoin: z.strictObject({
    terminal: z.string(),
    listItemPattern: pattern,
    joinHyphenated: z.boolean(),
  }),
  discouraged: z.strictObject({
    terms: z.array(z.string().min(1)),
    allCaps: z.strictObject({ minLetters: positiveInt, allow: z.array(z.string()) }),
    repeatedPunctuation: pattern,
  }),
  revertible: z.record(z.string(), z.boolean()),
});

export const standardsSchema = z
  .strictObject({
    rulesetVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'must be a semver version'),
    locales: z.strictObject({ default: z.string().min(1), supported: z.array(z.string().min(1)) }),
    stores: z.array(store).min(1),
    groups: z.array(group).min(1),
    input: z.strictObject({
      acceptedTypes: z.array(z.enum(['image/png', 'image/jpeg'])).min(1),
      upscaleWarnAbove: z.number().positive(),
      cropLossWarnAbove: z.number().gt(0).lt(1),
    }),
    presets: z.array(preset),
    fields: z.array(field),
    rules,
  })
  .superRefine((s, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });

    for (const [name, items] of [
      ['stores', s.stores],
      ['groups', s.groups],
      ['presets', s.presets],
      ['fields', s.fields],
    ] as const) {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        if (seen.has(item.id)) issue([name, index, 'id'], `duplicate id "${item.id}"`);
        seen.add(item.id);
      });
    }

    if (!s.locales.supported.includes(s.locales.default)) {
      issue(['locales', 'default'], 'default locale must be listed in supported');
    }

    const storeIds = new Set(s.stores.map((x) => x.id));
    const groupIds = new Set(s.groups.map((x) => x.id));
    const fieldIds = new Set(s.fields.map((x) => x.id));
    const outputNames = new Map<string, string>();

    s.presets.forEach((p, index) => {
      if (!storeIds.has(p.store)) issue(['presets', index, 'store'], `unknown store "${p.store}"`);
      if (!groupIds.has(p.group)) issue(['presets', index, 'group'], `unknown group "${p.group}"`);
      const outputName = `${p.folder}/${p.fileSuffix ?? ''}`;
      const clash = outputNames.get(outputName);
      if (clash !== undefined) {
        issue(['presets', index, 'folder'], `output names collide with preset "${clash}"`);
      }
      outputNames.set(outputName, p.id);
    });

    s.fields.forEach((f, index) => {
      if (!storeIds.has(f.store)) issue(['fields', index, 'store'], `unknown store "${f.store}"`);
      f.related.forEach((related, r) => {
        if (!fieldIds.has(related)) {
          issue(['fields', index, 'related', r], `unknown field "${related}"`);
        }
      });
    });

    for (const ruleId of Object.keys(s.rules.revertible)) {
      if (!isChangeRule(ruleId)) {
        issue(['rules', 'revertible', ruleId], `"${ruleId}" is not a change rule`);
      }
    }
  });

function isValidPattern(source: string): boolean {
  try {
    new RegExp(source, 'u');
    return true;
  } catch {
    return false;
  }
}

export type Standards = z.output<typeof standardsSchema>;
export type StandardsDocument = z.input<typeof standardsSchema>;
export type StoreDef = Standards['stores'][number];
export type GroupDef = Standards['groups'][number];
export type PresetDef = Standards['presets'][number];
export type FieldDef = Standards['fields'][number];
export type Anchor = z.output<typeof anchor>;
export type LimitUnit = FieldDef['limit']['unit'];
