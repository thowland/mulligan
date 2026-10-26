import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClearSession } from '../src/features/session/ClearSession.tsx';
import { SessionNotices } from '../src/features/session/SessionNotices.tsx';
import { useListingStore } from '../src/state/listing.ts';
import { resetSessionUi, useSessionStore } from '../src/state/session.ts';
import { Confirm } from '../src/ui/Confirm.tsx';
import { TabErrorBoundary } from '../src/ui/TabErrorBoundary.tsx';

beforeEach(() => {
  resetSessionUi();
  useListingStore.getState().reset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ClearSession', () => {
  it('asks before clearing, mentions the browser when saved, and can be cancelled', async () => {
    useSessionStore.setState({ mode: 'saved' });
    const onClear = vi.fn(() => Promise.resolve());
    render(<ClearSession onClear={onClear} />);
    const button = screen.getByRole('button', { name: 'Clear session' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const dialog = screen.getByRole('alertdialog', { name: 'Clear this session?' });
    expect(dialog).toHaveAccessibleDescription(
      /removed from this browser\. This cannot be undone\./,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('clears on confirmation', async () => {
    useSessionStore.setState({ mode: 'memory' });
    let finish!: () => void;
    const onClear = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<ClearSession onClear={onClear} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear session' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).not.toHaveTextContent('from this browser');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear session' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button', { name: 'Clear session' })[0]).toBeDisabled();
    finish();
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Clear session' })).toBeEnabled();
  });

  it('shows why a clear failed and does not swallow the error', async () => {
    useSessionStore.setState({ mode: 'saved' });
    const onClear = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('Mulligan could not remove your saved work.'))
      .mockRejectedValueOnce('plain failure')
      .mockResolvedValueOnce(undefined);
    render(<ClearSession onClear={onClear} />);
    const confirmClear = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Clear session' }));
      await userEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear session' }),
      );
    };

    await confirmClear();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not cleared. Mulligan could not remove your saved work.',
    );
    await confirmClear();
    expect(await screen.findByRole('alert')).toHaveTextContent('Not cleared. plain failure');
    // A later successful clear removes the error.
    await confirmClear();
    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(onClear).toHaveBeenCalledTimes(3);
  });

  it('clears the stores by default', async () => {
    useListingStore.getState().setInput('apple.name', { text: 'Example' });
    render(<ClearSession />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear session' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear session' }),
    );
    await vi.waitFor(() => expect(useListingStore.getState().inputs).toEqual({}));
  });
});

describe('SessionNotices', () => {
  it('renders nothing while there is nothing to say', () => {
    useSessionStore.setState({ mode: 'saved' });
    const { container } = render(<SessionNotices />);
    expect(container).toBeEmptyDOMElement();
  });

  it('warns when work is kept in memory only', () => {
    useSessionStore.setState({ mode: 'memory' });
    render(<SessionNotices />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Not saved on this device\..*reloading or closing the tab loses it\./,
    );
  });

  it('shows and dismisses the one-time save notice', async () => {
    useSessionStore.setState({ mode: 'saved', showSaveNotice: true });
    render(<SessionNotices />);
    expect(screen.getByText(/Your work is kept in this browser until you clear it/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(useSessionStore.getState()).toMatchObject({
      showSaveNotice: false,
      saveNoticeDismissed: true,
    });
    expect(screen.queryByText(/kept in this browser/)).not.toBeInTheDocument();
  });

  it('keeps a persistent notice while saved work could not be removed', () => {
    useSessionStore.setState({ mode: 'memory', clearError: 'Clear this site’s data.' });
    render(<SessionNotices />);
    const notice = screen.getByText(/Saved work is still in this browser\./).closest('p')!;
    expect(notice).toHaveTextContent(
      'Saved work is still in this browser. Clear this site’s data.',
    );
    expect(within(notice).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the removal notice in saved mode too', () => {
    useSessionStore.setState({ mode: 'saved', clearError: 'x' });
    render(<SessionNotices />);
    expect(screen.getByText(/Saved work is still in this browser/)).toBeVisible();
  });

  it('lists unsaved files and dismissible restore notices', async () => {
    useSessionStore.setState({
      mode: 'saved',
      unsaved: [
        { id: 'a', fileName: 'a.png' },
        { id: 'b', fileName: 'b.png' },
      ],
      notices: ['First notice.', 'Second notice.'],
    });
    render(<SessionNotices />);
    expect(
      screen.getByText(
        /Processed but not saved on this device \(storage is full\): a\.png, b\.png/,
      ),
    ).toBeVisible();
    await userEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!);
    expect(useSessionStore.getState().notices).toEqual(['Second notice.']);
    expect(screen.queryByText('First notice.')).not.toBeInTheDocument();
  });
});

describe('Confirm', () => {
  it('focuses Cancel, describes itself and cancels on Escape', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <Confirm title="Proceed?" confirmLabel="Go" onConfirm={onConfirm} onCancel={onCancel}>
        <p>Details.</p>
      </Confirm>,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Proceed?' });
    expect(dialog).toHaveAccessibleDescription('Details.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.keyboard('a');
    expect(onCancel).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('works without a body', () => {
    render(<Confirm title="Sure?" confirmLabel="Yes" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('alertdialog', { name: 'Sure?' })).not.toHaveAttribute(
      'aria-describedby',
    );
  });
});

function Boom(): never {
  throw new Error('boom');
}

describe('TabErrorBoundary', () => {
  it('renders its children when nothing fails', () => {
    render(
      <TabErrorBoundary label="Images">
        <p>Fine</p>
      </TabErrorBoundary>,
    );
    expect(screen.getByText('Fine')).toBeVisible();
  });

  it('contains a failure and offers a reload that keeps a saved session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useSessionStore.setState({ mode: 'saved' });
    const reload = vi.fn();
    render(
      <TabErrorBoundary label="Listing" reload={reload}>
        <Boom />
      </TabErrorBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByRole('heading', { name: 'The Listing tab stopped working' }),
    ).toBeVisible();
    expect(alert).toHaveTextContent('Your session is saved in this browser');
    await userEvent.click(screen.getByRole('button', { name: 'Reload (your session is saved)' }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      'The Listing tab failed',
      expect.any(Error),
      expect.anything(),
    );
  });

  it('warns that a reload loses unsaved work in memory mode', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useSessionStore.setState({ mode: 'memory' });
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    render(
      <TabErrorBoundary label="Images">
        <Boom />
      </TabErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('reloading loses it');
    screen.getByRole('button', { name: 'Reload (unsaved work will be lost)' }).click();
    expect(reload).toHaveBeenCalled();
  });
});
