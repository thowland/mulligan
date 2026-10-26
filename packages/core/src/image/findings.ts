import { RULES } from '../findings/catalog.ts';
import type { Finding, Subject } from '../findings/types.ts';

export interface FileRef {
  groupId: string;
  sourceId: string;
  fileName: string;
}

export function fileSubject(ref: FileRef, presetId?: string): Subject {
  const subject: Subject = {
    kind: 'file',
    groupId: ref.groupId,
    sourceId: ref.sourceId,
    fileName: ref.fileName,
  };
  return presetId === undefined ? subject : { ...subject, presetId };
}

/** A check result: 'pass' when it passed, otherwise the rule's catalog severity. */
export function checkFinding(
  ruleId: string,
  subject: Subject,
  passed: boolean,
  message: string,
  data?: Finding['data'],
): Finding {
  const rule = RULES[ruleId];
  if (rule?.kind !== 'check') throw new Error(`Unknown check rule "${ruleId}"`);
  const finding: Finding = {
    ruleId,
    severity: passed ? 'pass' : rule.severity!,
    subject,
    message,
  };
  return data === undefined ? finding : { ...finding, data };
}
