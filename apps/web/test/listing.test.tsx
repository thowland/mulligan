import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListingPanel } from '../src/features/listing/ListingPanel.tsx';
import { useListingStore } from '../src/state/listing.ts';

afterEach(() => {
  useListingStore.getState().reset();
  vi.restoreAllMocks();
});

const field = (name: string) => screen.getByRole('article', { name });
const cleaned = (name: string) =>
  within(field(name)).getByRole('region', { name: `Cleaned ${name}` });

/** Dispatch a paste carrying the given clipboard flavours. */
function paste(target: HTMLElement, flavours: Record<string, string>) {
  fireEvent.paste(target, {
    clipboardData: { getData: (type: string) => flavours[type] ?? '' },
  });
}

describe('ListingPanel', () => {
  it('cleans typed copy without changing wording', async () => {
    render(<ListingPanel debounceMs={0} />);
    const textarea = within(field('Description')).getByRole('textbox');
    await userEvent.type(textarea, 'Track  symptoms  😀 daily');
    expect(cleaned('Description')).toHaveTextContent('Track symptoms daily');
    expect(
      within(field('Description'))
        .getByText(/Changes made:/)
        .closest('p'),
    ).toHaveTextContent('Emoji removed · Repeated spaces collapsed');
  });

  it('reads rich clipboard HTML and shows the converted source', () => {
    render(<ListingPanel debounceMs={0} />);
    const editor = field('Full description');
    paste(within(editor).getByRole('textbox'), {
      'text/html': '<p>Intro.</p><ul><li>One</li><li>Two</li></ul>',
      'text/plain': 'Intro.\n\n* One\n* Two',
    });
    expect(within(editor).getByText(/Pasted with formatting/)).toBeInTheDocument();
    expect(within(editor).queryByRole('textbox')).not.toBeInTheDocument();
    expect(cleaned('Full description').textContent).toBe('Intro.\n\n– One\n– Two');
  });

  it('lets plain-text pastes through to the textarea', () => {
    render(<ListingPanel debounceMs={0} />);
    const textarea = within(field('Subtitle')).getByRole('textbox');
    paste(textarea, { 'text/plain': 'Plain' });
    expect(within(field('Subtitle')).queryByText(/Pasted with formatting/)).toBeNull();
  });

  it('converts a rich paste to plain text only after confirmation', async () => {
    render(<ListingPanel debounceMs={0} />);
    const editor = field('Promotional text');
    paste(within(editor).getByRole('textbox'), {
      'text/html': '<p>New&nbsp;version</p>',
      'text/plain': 'New version',
    });
    await userEvent.click(within(editor).getByRole('button', { name: 'Edit as plain text' }));
    await userEvent.click(within(editor).getByRole('button', { name: 'Cancel' }));
    expect(within(editor).queryByRole('textbox')).toBeNull();
    await userEvent.click(within(editor).getByRole('button', { name: 'Edit as plain text' }));
    await userEvent.click(within(editor).getByRole('button', { name: 'Discard formatting' }));
    expect(within(editor).getByRole('textbox')).toHaveValue('New\u00A0version');
  });

  it('clears a rich paste', async () => {
    render(<ListingPanel debounceMs={0} />);
    const editor = field('Release notes');
    paste(within(editor).getByRole('textbox'), { 'text/html': '<b>Fixes</b>' });
    await userEvent.click(within(editor).getByRole('button', { name: 'Clear' }));
    expect(within(editor).getByRole('textbox')).toHaveValue('');
  });

  it('marks text past the limit and reports the failure without truncating', async () => {
    render(<ListingPanel debounceMs={0} />);
    const editor = field('App title');
    const long = 'Example Health Symptom Tracker Pro';
    await userEvent.type(within(editor).getByRole('textbox'), long);
    expect(cleaned('App title')).toHaveTextContent(long);
    expect(within(cleaned('App title')).getByText('Pro').tagName).toBe('MARK');
    const meter = within(editor).getByRole('meter', { name: 'App title length' });
    expect(meter).toHaveAttribute('aria-valuetext', '34 / 30 characters, 4 over');
    expect(within(editor).getByText('Fails checks')).toBeInTheDocument();
    expect(within(editor).getByRole('list', { name: 'App title findings' })).toHaveTextContent(
      /34 of 30 characters: 4 over the limit/,
    );
  });

  it('shows warnings, passes and empty optional fields distinctly', async () => {
    render(<ListingPanel debounceMs={0} />);
    await userEvent.type(within(field('Short description')).getByRole('textbox'), 'BEST app');
    expect(within(field('Short description')).getByText('Check warnings')).toBeInTheDocument();
    await userEvent.type(within(field('App name')).getByRole('textbox'), 'Example Health');
    expect(within(field('App name')).getByText('Ready')).toBeInTheDocument();
    expect(within(field('Subtitle')).getByText('Optional, empty')).toBeInTheDocument();
    expect(within(field('Description')).getByText('Fails checks')).toBeInTheDocument();
    expect(within(field('Subtitle')).getByText('Nothing to submit yet.')).toBeInTheDocument();
  });

  it('counts keywords in bytes', async () => {
    render(<ListingPanel debounceMs={0} />);
    const editor = field('Keywords');
    await userEvent.type(within(editor).getByRole('textbox'), 'santé, diary');
    expect(cleaned('Keywords')).toHaveTextContent('santé,diary');
    expect(within(editor).getByRole('meter')).toHaveAttribute('aria-valuetext', '12 / 100 bytes');
  });

  it('straightens quotes when the option is on', async () => {
    render(<ListingPanel debounceMs={0} />);
    const editor = field('Description');
    await userEvent.type(within(editor).getByRole('textbox'), 'It’s here');
    expect(cleaned('Description')).toHaveTextContent('It’s here');
    await userEvent.click(
      within(editor).getByRole('checkbox', { name: 'Straighten curly quotes' }),
    );
    expect(cleaned('Description')).toHaveTextContent("It's here");
  });

  it('debounces cleaning', async () => {
    render(<ListingPanel debounceMs={50} />);
    const textarea = within(field('Subtitle')).getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Track  mood' } });
    expect(cleaned('Subtitle')).toHaveTextContent('Nothing to submit yet.');
    await waitFor(() => expect(cleaned('Subtitle')).toHaveTextContent('Track mood'));
  });

  it('copies the cleaned text', async () => {
    const user = userEvent.setup();
    render(<ListingPanel debounceMs={0} />);
    const editor = field('App name');
    const copy = within(editor).getByRole('button', { name: 'Copy cleaned App name' });
    expect(copy).toBeDisabled();
    await user.type(within(editor).getByRole('textbox'), 'Example  Health');
    await user.click(copy);
    expect(await navigator.clipboard.readText()).toBe('Example Health');
    expect(within(editor).getByRole('status')).toHaveTextContent('Copied');
  });

  it('explains when copying is not possible', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(<ListingPanel debounceMs={0} />);
    const editor = field('App name');
    await user.type(within(editor).getByRole('textbox'), 'Example');
    await user.click(within(editor).getByRole('button', { name: 'Copy cleaned App name' }));
    expect(within(editor).getByRole('status')).toHaveTextContent('Copy failed');
  });
});
