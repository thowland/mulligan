export type Severity = 'pass' | 'warning' | 'failure';

export type Store = string;

/** What a finding is about. */
export type Subject =
  | { kind: 'field'; fieldId: string; store: Store; locale: string }
  | { kind: 'file'; groupId: string; sourceId: string; fileName: string; presetId?: string }
  | { kind: 'group'; groupId: string; presetId?: string }
  | { kind: 'listing' }
  | { kind: 'package' }
  | { kind: 'standards'; path: string };

export interface Finding {
  /** Stable rule identifier from the catalog; never reused for a different meaning. */
  ruleId: string;
  severity: Severity;
  subject: Subject;
  /** English message rendered from the rule's template and data. */
  message: string;
  data?: Record<string, string | number | boolean | null>;
  /** Offsets in the cleaned text, where relevant. */
  span?: { start: number; end: number };
}

export interface Summary {
  counts: Record<Severity, number>;
  /** Worst severity present; 'pass' when there are no findings. */
  worst: Severity;
}
