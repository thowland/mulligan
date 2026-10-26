import type { Change, FieldDef, FieldResult, Finding, RawFieldInput } from '@mulligan/core';
import { useId, useState, type ClipboardEvent } from 'react';
import { plainTextOf, ruleTitle } from '../../core-bridge/listing.ts';
import { StatusBadge, type BadgeStatus } from '../../ui/StatusBadge.tsx';
import { formatLimit } from '../format.ts';
import { ChangeReview } from './ChangeReview.tsx';
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
  onToggleRevert: (changeId: string) => void;
  /** Reverted change ids as held in the store. */
  reverted?: readonly string[] | undefined;
  /** Reverted changes that a source edit just cleared, to explain why they are back. */
  clearedReverts?: number | undefined;
  onDismissCleared?: () => void;
  /** The iOS field this one can copy its source from (`copyFrom` in the standards). */
  copySource?: { label: string; input: RawFieldInput } | undefined;
}

const isBlank = (input: RawFieldInput) => input.text.trim() === '' && !input.html;
const sameInput = (a: RawFieldInput, b: RawFieldInput) => a.text === b.text && a.html === b.html;

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
  const { field, input, straightQuotes, result, onInput, onStraightQuotes, onToggleRevert } = props;
  const id = useId();
  const [confirmPlain, setConfirmPlain] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const reviewCount = result.changes.filter((c) => c.ruleId !== 'html.extract').length;
  const revertedCount = result.changes.filter((c) => c.reverted).length;
  const rich = input.html !== undefined;
  const status = statusOf(field, input, result);
  const problems: Finding[] = result.findings.filter((f) => f.severity !== 'pass');
  const summary = changeSummary(result.changes);

  const copySource = props.copySource;
  const copy = () => {
    if (!copySource) return;
    if (isBlank(input) || sameInput(input, copySource.input)) onInput(copySource.input);
    else setConfirmCopy(true);
  };

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
          {copySource &&
            (confirmCopy ? (
              <div className={styles.confirm} role="group" aria-label="Replace with iOS copy">
                <span>
                  Replace this {field.label} with the iOS {copySource.label}?
                </span>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => {
                    onInput(copySource.input);
                    setConfirmCopy(false);
                  }}
                >
                  Replace
                </button>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setConfirmCopy(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.button}
                  disabled={isBlank(copySource.input)}
                  title={
                    isBlank(copySource.input) ? `The iOS ${copySource.label} is empty` : undefined
                  }
                  onClick={copy}
                >
                  Copy from iOS {copySource.label}
                </button>
              </div>
            ))}
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

      {props.clearedReverts !== undefined && props.clearedReverts > 0 && (
        <p className={styles.cleared} role="status">
          Editing the source cleared {props.clearedReverts} reverted{' '}
          {props.clearedReverts === 1 ? 'change' : 'changes'}; review the changes again.
          <button type="button" className={styles.linkButton} onClick={props.onDismissCleared}>
            Dismiss
          </button>
        </p>
      )}

      {status !== 'empty' && (reviewCount > 0 || rich) && (
        <div className={styles.reviewBar}>
          <button
            type="button"
            className={styles.button}
            aria-expanded={reviewing}
            aria-controls={`${id}-review`}
            onClick={() => setReviewing((value) => !value)}
          >
            {reviewing ? 'Hide changes' : `Review changes (${reviewCount})`}
          </button>
          {revertedCount > 0 && (
            <span className={styles.reverted}>
              {revertedCount} reverted {revertedCount === 1 ? 'change' : 'changes'}
            </span>
          )}
        </div>
      )}
      {reviewing && status !== 'empty' && (
        <div id={`${id}-review`}>
          <ChangeReview
            label={field.label}
            baseline={result.baseline}
            output={result.output}
            changes={result.changes}
            html={input.html}
            reverted={props.reverted ?? []}
            onToggle={onToggleRevert}
          />
        </div>
      )}
    </article>
  );
}
