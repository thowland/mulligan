import type { Change, FieldDef, FieldResult, Finding, RawFieldInput } from '@mulligan/core';
import { useId, useState, type ClipboardEvent } from 'react';
import { plainTextOf, ruleTitle } from '../../core-bridge/listing.ts';
import { StatusBadge, type BadgeStatus } from '../../ui/StatusBadge.tsx';
import { formatLimit } from '../format.ts';
import { CleanedText } from './CleanedText.tsx';
import { CopyButton } from './CopyButton.tsx';
import { CountMeter } from './CountMeter.tsx';
import styles from './FieldEditor.module.css';

interface FieldEditorProps {
  field: FieldDef;
  input: RawFieldInput;
  straightQuotes: boolean;
  /** Latest result from core; may lag the input by the debounce interval. */
  result: FieldResult;
  onInput: (input: RawFieldInput) => void;
  onStraightQuotes: (value: boolean) => void;
}

function statusOf(field: FieldDef, input: RawFieldInput, result: FieldResult): BadgeStatus {
  if (!field.required && input.text.trim() === '' && !input.html) return 'empty';
  const failing = result.findings.filter((f) => f.severity !== 'pass');
  if (failing.some((f) => f.severity === 'failure')) return 'failure';
  return failing.length > 0 ? 'warning' : 'pass';
}

/** Applied changes grouped by rule, for a one-line summary per rule. */
function changeSummary(changes: Change[]): { ruleId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const change of changes) {
    if (change.reverted || change.ruleId === 'html.extract') continue;
    counts.set(change.ruleId, (counts.get(change.ruleId) ?? 0) + 1);
  }
  return Array.from(counts, ([ruleId, count]) => ({ ruleId, count }));
}

export function FieldEditor(props: FieldEditorProps) {
  const { field, input, straightQuotes, result, onInput, onStraightQuotes } = props;
  const id = useId();
  const [confirmPlain, setConfirmPlain] = useState(false);
  const rich = input.html !== undefined;
  const status = statusOf(field, input, result);
  const problems: Finding[] = result.findings.filter((f) => f.severity !== 'pass');
  const summary = changeSummary(result.changes);

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = event.clipboardData.getData('text/html');
    if (html.trim() === '') return; // plain text: let the browser insert it at the cursor
    event.preventDefault();
    onInput({ text: event.clipboardData.getData('text/plain'), html });
  };

  return (
    <article className={styles.field} aria-labelledby={`${id}-label`}>
      <header className={styles.header}>
        <h3 id={`${id}-label`} className={styles.label}>
          {field.label}
        </h3>
        <span className={styles.meta}>
          {formatLimit(field.limit)} · {field.multiline ? 'multi-line' : 'single line'}
          {field.required ? ' · required' : ''}
        </span>
        <StatusBadge status={status} />
      </header>

      <div className={styles.columns}>
        <div className={styles.column}>
          <span className={styles.columnTitle} id={`${id}-source`}>
            Source
          </span>
          {rich ? (
            <div className={styles.rich}>
              <p className={styles.richNote}>
                Pasted with formatting. Paragraphs and lists were converted to text.
              </p>
              <div className={styles.richText} aria-labelledby={`${id}-source`}>
                {result.baseline}
              </div>
              {confirmPlain ? (
                <div className={styles.confirm} role="group" aria-label="Discard formatting">
                  <span>Discard the pasted formatting and edit as plain text?</span>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => {
                      onInput({ text: plainTextOf(input) });
                      setConfirmPlain(false);
                    }}
                  >
                    Discard formatting
                  </button>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => setConfirmPlain(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => setConfirmPlain(true)}
                  >
                    Edit as plain text
                  </button>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => onInput({ text: '' })}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          ) : (
            <textarea
              className={styles.textarea}
              aria-labelledby={`${id}-label ${id}-source`}
              rows={field.multiline ? 7 : 2}
              value={input.text}
              placeholder="Paste from Word, Google Docs or a web page, or type"
              spellCheck={false}
              onPaste={onPaste}
              onChange={(event) => onInput({ text: event.target.value })}
            />
          )}
          <label className={styles.option}>
            <input
              type="checkbox"
              checked={straightQuotes}
              onChange={(event) => onStraightQuotes(event.target.checked)}
            />
            Straighten curly quotes
          </label>
        </div>

        <div className={styles.column}>
          <span className={styles.columnTitle}>Cleaned</span>
          <section aria-label={`Cleaned ${field.label}`}>
            <CleanedText text={result.output} overflowAt={result.count.overflowAt} />
          </section>
          <div className={styles.outputBar}>
            <CountMeter count={result.count} label={field.label} />
            <CopyButton text={result.output} label={field.label} />
          </div>
        </div>
      </div>

      {(problems.length > 0 || summary.length > 0) && status !== 'empty' && (
        <div className={styles.report}>
          {problems.length > 0 && (
            <ul className={styles.findings} aria-label={`${field.label} findings`}>
              {problems.map((finding, index) => (
                <li key={`${finding.ruleId}-${index}`} data-severity={finding.severity}>
                  <span className={styles.severity}>
                    {finding.severity === 'failure' ? 'Failure' : 'Warning'}
                  </span>
                  {finding.message}
                </li>
              ))}
            </ul>
          )}
          {summary.length > 0 && (
            <p className={styles.changes}>
              <span className={styles.changesTitle}>Changes made:</span>{' '}
              {summary
                .map(({ ruleId, count }) => `${ruleTitle(ruleId)}${count > 1 ? ` ×${count}` : ''}`)
                .join(' · ')}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
