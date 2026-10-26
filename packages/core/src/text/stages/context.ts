import type { FieldDef, Standards } from '../../standards/schema.ts';
import type { Edit } from '../trace/trace.ts';

export interface StageContext {
  field: FieldDef;
  standards: Standards;
  straightQuotes: boolean;
  /** Symbols the emoji filter must keep (®, ™, ©). */
  preserve: ReadonlySet<string>;
}

/** A normalization stage: proposes sorted, non-overlapping edits on the current text. */
export interface Stage {
  /** Rule ids the stage can emit. */
  rules: readonly string[];
  appliesTo(context: StageContext): boolean;
  run(text: string, context: StageContext): Edit[];
}

/** Edits replacing every match of a global regular expression. */
export function editsForMatches(
  text: string,
  pattern: RegExp,
  ruleId: string,
  replace: (match: RegExpExecArray) => string | null,
  detail?: (match: RegExpExecArray) => string,
): Edit[] {
  const edits: Edit[] = [];
  for (const match of text.matchAll(pattern)) {
    const replacement = replace(match);
    if (replacement === null || replacement === match[0]) continue;
    edits.push({
      start: match.index,
      end: match.index + match[0].length,
      replacement,
      ruleId,
      ...(detail ? { detail: detail(match) } : {}),
    });
  }
  return edits;
}
