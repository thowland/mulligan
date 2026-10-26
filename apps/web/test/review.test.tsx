import type { Change } from '@mulligan/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChangeReview } from '../src/features/listing/ChangeReview.tsx';
import { ListingPanel } from '../src/features/listing/ListingPanel.tsx';

const change = (overrides: Partial<Change>): Change => ({
  id: 'lines.rejoin@5:6',
  ruleId: 'lines.rejoin',
  baselineSpan: { start: 5, end: 6 },
  outputSpan: { start: 5, end: 6 },
  before: '\n',
  after: ' ',
  revertible: true,
  reverted: false,
  ...overrides,
});

function renderReview(props: Partial<Parameters<typeof ChangeReview>[0]> = {}) {
  const onToggle = vi.fn();
  render(
    <ChangeReview
      label="Description"
      baseline={'Track\nthis'}
      output="Track this"
      changes={[change({})]}
      reverted={[]}
      onToggle={onToggle}
      {...props}
    />,
  );
  return onToggle;
}

describe('ChangeReview', () => {
  it('highlights a change on both sides and links them on hover', async () => {
    renderReview();
    const original = screen.getByRole('region', { name: 'Original' });
    const cleaned = screen.getByRole('region', { name: 'Cleaned' });
    const left = original.querySelector('mark')!;
    const right = cleaned.querySelector('mark')!;
    expect(left).toHaveAttribute('data-newline');
    expect(left).toHaveAttribute('data-blank');
    expect(right).toHaveAttribute('title', 'Hard-wrapped line rejoined');

    await userEvent.hover(left);
    expect(right).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('listitem')).toHaveAttribute('data-active', 'true');
    await userEvent.unhover(left);
    expect(right).not.toHaveAttribute('data-active');

    await userEvent.hover(screen.getByRole('listitem'));
    expect(left).toHaveAttribute('data-active', 'true');
    await userEvent.unhover(screen.getByRole('listitem'));
    expect(left).not.toHaveAttribute('data-active');
  });

  it('lists changes by rule with visible before and after', () => {
    renderReview();
    const group = screen.getByRole('group', { name: 'Description changes' });
    expect(
      within(group).getByRole('heading', { name: 'Hard-wrapped line rejoined (1)' }),
    ).toBeVisible();
    expect(within(group).getByText('⏎')).toBeVisible();
    expect(within(group).getByText('␣')).toBeVisible();
  });

  it('toggles a revertible change and highlights it while focused', () => {
    const onToggle = renderReview();
    const checkbox = screen.getByRole('checkbox', { name: 'Applied' });
    expect(checkbox).toBeChecked();
    fireEvent.focus(checkbox);
    expect(screen.getByRole('region', { name: 'Cleaned' }).querySelector('mark')).toHaveAttribute(
      'data-active',
    );
    fireEvent.blur(checkbox);
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith('lines.rejoin@5:6');
  });

  it('shows reverted changes from the store at once', () => {
    renderReview({
      output: 'Track\nthis',
      changes: [change({ reverted: true })],
      reverted: ['lines.rejoin@5:6'],
    });
    expect(screen.getByRole('checkbox', { name: 'Reverted' })).not.toBeChecked();
    expect(screen.getByRole('listitem')).toHaveAttribute('data-reverted', 'true');
    expect(screen.getByRole('region', { name: 'Original' }).querySelector('mark')).toHaveAttribute(
      'data-reverted',
      'true',
    );
  });

  it('marks deletions as points and non-revertible changes as always applied', () => {
    renderReview({
      baseline: 'Hi😀',
      output: 'Hi',
      changes: [
        change({
          id: 'chars.emoji@2:4',
          ruleId: 'chars.emoji',
          baselineSpan: { start: 2, end: 4 },
          outputSpan: { start: 2, end: 2 },
          before: '😀',
          after: '',
        }),
        change({
          id: 'lines.single-line@0:0',
          ruleId: 'lines.single-line',
          baselineSpan: { start: 0, end: 0 },
          outputSpan: { start: 0, end: 0 },
          before: '',
          after: '',
          revertible: false,
        }),
      ],
    });
    const cleaned = screen.getByRole('region', { name: 'Cleaned' });
    expect(cleaned.querySelectorAll('[data-change]')).toHaveLength(2);
    expect(screen.getByText('Always applied')).toBeVisible();
    expect(screen.getAllByText('nothing')).toHaveLength(3);
  });

  it('summarizes HTML extraction and shows the raw HTML on request', async () => {
    renderReview({
      changes: [
        change({
          id: 'html.extract@0:10',
          ruleId: 'html.extract',
          detail: '4 tags removed',
          revertible: false,
        }),
      ],
      html: '<p>Track</p><p>this</p>',
    });
    expect(screen.getByText('HTML converted to text: 4 tags removed.')).toBeVisible();
    expect(screen.getByText('No characters or whitespace were changed.')).toBeVisible();
    const pre = document.querySelector('pre')!;
    expect(pre).not.toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'View raw HTML' }));
    expect(pre).toBeVisible();
    expect(pre).toHaveTextContent('<p>Track</p><p>this</p>');
    await userEvent.click(screen.getByRole('button', { name: 'Hide raw HTML' }));
    expect(pre).not.toBeVisible();
  });

  it('highlights changes made by HTML extraction on the cleaned side only', () => {
    renderReview({
      baseline: '– One',
      output: '– One',
      changes: [
        change({
          id: 'html.list-item@0:2',
          ruleId: 'html.list-item',
          baselineSpan: { start: 0, end: 2 },
          outputSpan: { start: 0, end: 2 },
          before: '',
          after: '– ',
          revertible: false,
        }),
      ],
    });
    expect(screen.getByRole('region', { name: 'Original' }).querySelector('mark')).toBeNull();
    expect(screen.getByRole('region', { name: 'Cleaned' }).querySelector('mark')).not.toBeNull();
    expect(screen.getByText('· from the pasted formatting', { exact: false })).toBeVisible();
  });

  it('shows empty sides', () => {
    renderReview({ baseline: '', output: '', changes: [] });
    expect(screen.getAllByText('Empty')).toHaveLength(2);
  });
});

describe('listing review in the panel', () => {
  const description = () => screen.getByRole('article', { name: 'Description' });

  it('reverts a change, keeps the break and explains cleared reverts after an edit', async () => {
    render(<ListingPanel debounceMs={0} />);
    const source = within(description()).getByRole('textbox');
    fireEvent.change(source, { target: { value: 'Track symptoms and share\nreports.' } });
    const cleaned = within(description()).getByRole('region', { name: 'Cleaned Description' });
    expect(cleaned).toHaveTextContent('Track symptoms and share reports.');

    await userEvent.click(
      within(description()).getByRole('button', { name: 'Review changes (1)' }),
    );
    await userEvent.click(within(description()).getByRole('checkbox', { name: 'Applied' }));
    expect(cleaned.textContent).toBe('Track symptoms and share\nreports.');
    expect(within(description()).getByText('1 reverted change')).toBeVisible();

    fireEvent.change(source, { target: { value: 'Track symptoms and share\nreports now.' } });
    const notice = within(description()).getByText(/Editing the source cleared 1 reverted change/);
    expect(cleaned).toHaveTextContent('Track symptoms and share reports now.');
    await userEvent.click(within(notice).getByRole('button', { name: 'Dismiss' }));
    expect(within(description()).queryByText(/Editing the source cleared/)).not.toBeInTheDocument();

    await userEvent.click(within(description()).getByRole('button', { name: 'Hide changes' }));
    expect(
      within(description()).queryByRole('region', { name: 'Original' }),
    ).not.toBeInTheDocument();
  });

  it('offers review for rich pastes even without character changes', () => {
    render(<ListingPanel debounceMs={0} />);
    const transfer = {
      getData: (type: string) => (type === 'text/html' ? '<p>Plain words</p>' : 'Plain words'),
    };
    fireEvent.paste(within(description()).getByRole('textbox'), { clipboardData: transfer });
    expect(within(description()).getByRole('button', { name: 'Review changes (0)' })).toBeVisible();
  });
});
