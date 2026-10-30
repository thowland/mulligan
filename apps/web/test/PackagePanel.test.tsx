import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PackagePanel } from '../src/features/package/PackagePanel.tsx';
import { RenderCacheContext, type RenderCache } from '../src/render/cache.ts';
import { useImageStore } from '../src/state/images.ts';
import { useListingStore } from '../src/state/listing.ts';
import { fakeCache, sourceEntry } from './helpers/images.ts';

function renderPanel(cache: RenderCache = fakeCache()) {
  return render(
    <RenderCacheContext.Provider value={() => cache}>
      <PackagePanel />
    </RenderCacheContext.Provider>,
  );
}

let saved: string[] = [];
beforeEach(() => {
  useImageStore.getState().reset();
  useListingStore.getState().reset();
  saved = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push(this.download);
  });
});
afterEach(() => vi.restoreAllMocks());

describe('PackagePanel', () => {
  it('shows the empty state until there is something to package', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Nothing to package yet' })).toBeInTheDocument();
  });

  it('summarises folders and checks, then downloads the package', async () => {
    const store = useImageStore.getState();
    store.addSources('screenshot', [sourceEntry('a.png'), sourceEntry('b.png')]);
    store.addSources('icon', [sourceEntry('logo.png', 1024, 1024, 'icon')]);
    renderPanel();

    const table = screen.getByRole('table', { name: 'Contents' });
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent);
    expect(rows).toEqual(['iphone-6.3/2', 'android-phone/2', 'icons/2', 'manifest.json1']);
    // The feature graphic is not selected by default (ruleset 1.0.1), so every check passes.
    expect(screen.getByText(/^All \d+ checks pass\.$/)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Findings' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Download package' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(
      await screen.findByText(/^Saved mulligan-\d{4}-\d{2}-\d{2}-\d{4}\.zip \(/),
    ).toBeInTheDocument();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/^mulligan-.*\.zip$/);
  });

  it('packages a listing on its own and shows its status', async () => {
    useListingStore.getState().setInput('apple.name', { text: 'Example Health' });
    renderPanel();
    const rows = within(screen.getByRole('table', { name: 'Contents' }))
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent);
    expect(rows).toEqual(['listing/2', 'manifest.json1']);
    const listing = screen.getByRole('region', { name: 'Listing' });
    expect(listing).toHaveTextContent(/\d+ failures? in the listing; see the Listing tab/);

    // Failures: the download asks first and lists them.
    await userEvent.click(screen.getByRole('button', { name: 'Download package' }));
    const dialog = screen.getByRole('alertdialog', {
      name: /^Download a package with \d+ failures\?$/,
    });
    expect(
      within(dialog).getByText('Apple App Store · Description', { exact: false }),
    ).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Download package' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(saved).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Download package' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Download package' }));
    await userEvent.click(screen.getByRole('button', { name: 'Download anyway' }));
    expect(await screen.findByText(/^Saved mulligan-/)).toBeInTheDocument();
    expect(saved).toHaveLength(1);
  });

  it('lists every warning and failure in a sortable table', async () => {
    useImageStore.getState().addSources('screenshot', [sourceEntry('small.png', 600, 1200)]);
    useListingStore.getState().setInput('apple.name', { text: 'FREE Health!!' });
    renderPanel();
    const table = screen.getByRole('table', { name: 'Findings' });
    const column = (index: number) =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[index]!.textContent);

    // Worst first by default.
    const severities = column(0);
    expect(severities[0]).toBe('Failure');
    expect(severities.at(-1)).toBe('Warning');
    expect(column(1)).toContain('small.png · iPhone 6.3" screenshot');
    expect(column(1)).toContain('Apple App Store · App name');
    expect(column(2)).toContain('Image upscaled');
    expect(screen.getByText(/^\d+ other checks? pass/)).toBeInTheDocument();

    const header = (name: string) => within(table).getByRole('columnheader', { name });
    expect(header('Severity')).toHaveAttribute('aria-sort', 'descending');
    await userEvent.click(within(header('Severity')).getByRole('button'));
    expect(header('Severity')).toHaveAttribute('aria-sort', 'ascending');
    expect(column(0)[0]).toBe('Warning');

    await userEvent.click(within(header('Subject')).getByRole('button'));
    expect(header('Subject')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('Severity')).toHaveAttribute('aria-sort', 'none');
    const subjects = column(1);
    expect(subjects).toEqual([...subjects].sort((a, b) => a!.localeCompare(b!)));
    await userEvent.click(within(header('Subject')).getByRole('button'));
    expect(header('Subject')).toHaveAttribute('aria-sort', 'descending');

    await userEvent.click(within(header('Check')).getByRole('button'));
    await userEvent.click(within(header('Message')).getByRole('button'));
    expect(header('Message')).toHaveAttribute('aria-sort', 'ascending');
  });

  it('reports a passing listing', () => {
    const complete: Record<string, string> = {
      'apple.name': 'Example Health',
      'apple.description': 'Track symptoms.',
      'apple.keywords': 'diary,doctor',
      'google.title': 'Example Health',
      'google.short-description': 'Track symptoms and share reports.',
      'google.full-description': 'Track symptoms.',
    };
    for (const [id, text] of Object.entries(complete)) {
      useListingStore.getState().setInput(id, { text });
    }
    renderPanel();
    expect(screen.getByRole('region', { name: 'Listing' })).toHaveTextContent(
      'Every field passes its checks.',
    );
  });

  it('words listing warnings', () => {
    const complete: Record<string, string> = {
      'apple.name': 'FREE Health',
      'apple.description': 'Track symptoms.',
      'apple.keywords': 'diary,doctor',
      'google.title': 'Example Health',
      'google.short-description': 'Track symptoms and share reports.',
      'google.full-description': 'Track symptoms.',
    };
    for (const [id, text] of Object.entries(complete)) {
      useListingStore.getState().setInput(id, { text });
    }
    renderPanel();
    expect(screen.getByRole('region', { name: 'Listing' })).toHaveTextContent(
      /^Listing.*\d+ warnings? in the listing/,
    );
  });

  it('shows progress while building and reports a build failure', async () => {
    useImageStore.getState().addSources('screenshot', [sourceEntry('a.png')]);
    let release: (() => void) | undefined;
    const cache = fakeCache({
      full: () =>
        new Promise((_resolve, reject) => {
          release = () => reject(new Error('not reached'));
        }),
    });
    // A blob whose bytes cannot be read makes the build itself fail.
    const failing = fakeCache({
      full: async () => ({
        blob: { arrayBuffer: () => Promise.reject(new Error('disk full')) } as unknown as Blob,
        mimeType: 'image/png',
        width: 1,
        height: 1,
        size: 1,
        findings: [],
      }),
    });
    const { unmount } = renderPanel(cache);
    await userEvent.click(screen.getByRole('button', { name: 'Download package' }));
    expect(screen.getByRole('button', { name: 'Download package' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Preparing 0 of 2 files…');
    release!();
    unmount();

    renderPanel(failing);
    await userEvent.click(screen.getByRole('button', { name: 'Download package' }));
    expect(
      await screen.findByText('The package could not be built: disk full'),
    ).toBeInTheDocument();
    expect(saved).toEqual([]);
  });

  it('reports a non-Error build failure', async () => {
    useImageStore.getState().addSources('icon', [sourceEntry('logo.png', 512, 512, 'icon')]);
    renderPanel(
      fakeCache({
        full: async () => ({
          blob: { arrayBuffer: () => Promise.reject('broken') } as unknown as Blob,
          mimeType: 'image/png',
          width: 1,
          height: 1,
          size: 1,
          findings: [],
        }),
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Download package' }));
    expect(await screen.findByText('The package could not be built: broken')).toBeInTheDocument();
  });
});
