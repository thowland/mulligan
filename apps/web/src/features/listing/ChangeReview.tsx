import type { Change } from '@mulligan/core';
import { Fragment, useId, useState } from 'react';
import { ruleTitle } from '../../core-bridge/listing.ts';
import styles from './ChangeReview.module.css';
import { isBlank, segmentText, visibleTokens, type Highlight } from './segments.ts';

interface ChangeReviewProps {
  label: string;
  baseline: string;
  output: string;
  changes: readonly Change[];
  /** Raw clipboard HTML, when the source was a rich paste. */
  html?: string | undefined;
  /** Reverted ids from the store: toggles follow them at once, not the debounced result. */
  reverted: readonly string[];
  onToggle: (changeId: string) => void;
}

const fromHtml = (change: Change) => change.ruleId.startsWith('html.');

/** Changes shown in the review: extraction is summarized, not highlighted. */
const reviewable = (changes: readonly Change[]) =>
  changes.filter((change) => change.ruleId !== 'html.extract');

/**
 * Side-by-side original and cleaned text with every change highlighted on both sides and linked
 * to an entry in the change list, where revertible changes can be reverted and restored (spec §9.3).
 * All text renders as text nodes; nothing is ever inserted as HTML (spec §10.4).
 */
export function ChangeReview({
  label,
  baseline,
  output,
  changes,
  html,
  reverted,
  onToggle,
}: ChangeReviewProps) {
  const id = useId();
  const isReverted = (change: Change) => reverted.includes(change.id);
  const [active, setActive] = useState<string | null>(null);
  const [showHtml, setShowHtml] = useState(false);
  const shown = reviewable(changes);
  const extraction = changes.find((change) => change.ruleId === 'html.extract');
  const byId = new Map(shown.map((change) => [change.id, change]));

  const groups = new Map<string, Change[]>();
  for (const change of shown)
    groups.set(change.ruleId, [...(groups.get(change.ruleId) ?? []), change]);

  const side = (text: string, spans: Highlight[], title: string) => (
    <div className={styles.side}>
      <h4 className={styles.sideTitle} id={`${id}-${title}`}>
        {title}
      </h4>
      <div className={styles.text} aria-labelledby={`${id}-${title}`} role="region">
        {text === '' ? (
          <span className={styles.empty}>Empty</span>
        ) : (
          segmentText(text, spans).map((segment, index) => {
            if (segment.ids.length === 0 && segment.kind === 'text') {
              return <Fragment key={index}>{segment.text}</Fragment>;
            }
            const changeId = segment.ids.at(-1)!;
            const common = {
              'data-change': changeId,
              'data-active': segment.ids.includes(active ?? '') || undefined,
              'data-reverted': byId.get(changeId)?.reverted || undefined,
              onMouseEnter: () => setActive(changeId),
              onMouseLeave: () => setActive(null),
              title: ruleTitle(byId.get(changeId)!.ruleId),
            };
            if (segment.kind === 'point') {
              return <span key={index} className={styles.point} {...common} />;
            }
            return (
              <mark
                key={index}
                className={styles.mark}
                data-blank={isBlank(segment.text) || undefined}
                data-newline={segment.text.includes('\n') || undefined}
                {...common}
              >
                {segment.text}
              </mark>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className={styles.review}>
      <div className={styles.sides}>
        {side(
          baseline,
          // The original is the text extracted from the paste, so changes made by extraction
          // (list markers) are already part of it and are highlighted on the cleaned side only.
          shown.filter((c) => !fromHtml(c)).map((c) => ({ id: c.id, ...c.baselineSpan })),
          'Original',
        )}
        {side(
          output,
          shown.map((c) => ({ id: c.id, ...c.outputSpan })),
          'Cleaned',
        )}
      </div>

      {html !== undefined && (
        <div className={styles.raw}>
          <button
            type="button"
            className={styles.linkButton}
            aria-expanded={showHtml}
            aria-controls={`${id}-raw`}
            onClick={() => setShowHtml((value) => !value)}
          >
            {showHtml ? 'Hide raw HTML' : 'View raw HTML'}
          </button>
          <pre id={`${id}-raw`} hidden={!showHtml} className={styles.rawHtml}>
            {html}
          </pre>
        </div>
      )}

      {extraction && (
        <p className={styles.extraction}>
          {ruleTitle('html.extract')}
          {extraction.detail ? `: ${extraction.detail}` : ''}.
        </p>
      )}

      {shown.length === 0 ? (
        <p className={styles.none}>No characters or whitespace were changed.</p>
      ) : (
        <div className={styles.groups} aria-label={`${label} changes`} role="group">
          {[...groups].map(([ruleId, list]) => (
            <section key={ruleId} className={styles.group}>
              <h4 className={styles.groupTitle}>
                {ruleTitle(ruleId)} <span className={styles.count}>({list.length})</span>
                {fromHtml(list[0]!) && (
                  <span className={styles.count}> · from the pasted formatting</span>
                )}
              </h4>
              <ul className={styles.list}>
                {list.map((change, index) => (
                  <li
                    key={change.id}
                    className={styles.item}
                    data-active={change.id === active || undefined}
                    data-reverted={isReverted(change) || undefined}
                    onMouseEnter={() => setActive(change.id)}
                    onMouseLeave={() => setActive(null)}
                  >
                    <span className={styles.diff} id={`${id}-${ruleId}-${index}`}>
                      <Tokens text={change.before} />
                      <span aria-hidden="true" className={styles.arrow}>
                        →
                      </span>
                      <span className={styles.srOnly}>{' becomes '}</span>
                      <Tokens text={change.after} />
                    </span>
                    {change.revertible ? (
                      <span className={styles.control}>
                        <span
                          className={styles.state}
                          data-reverted={isReverted(change) || undefined}
                        >
                          {isReverted(change) ? 'Reverted' : 'Applied'}
                        </span>
                        <button
                          type="button"
                          className={styles.revert}
                          aria-describedby={`${id}-${ruleId}-${index}`}
                          onClick={() => onToggle(change.id)}
                          onFocus={() => setActive(change.id)}
                          onBlur={() => setActive(null)}
                        >
                          {isReverted(change) ? 'Restore' : 'Revert'}
                        </button>
                      </span>
                    ) : (
                      <span className={styles.fixed}>Always applied</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Tokens({ text }: { text: string }) {
  return (
    <code className={styles.tokens}>
      {visibleTokens(text).map((token, index) =>
        token.symbol ? (
          <span key={index} className={styles.symbol}>
            {token.text}
          </span>
        ) : (
          <Fragment key={index}>{token.text}</Fragment>
        ),
      )}
    </code>
  );
}
