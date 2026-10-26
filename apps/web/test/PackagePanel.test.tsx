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

    const table = screen.getByRole('table');
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent);
    expect(rows).toEqual(['iphone-6.9/2', 'android-phone/2', 'icons/2', 'manifest.json1']);
    expect(
      screen.getByText(/Google Play feature graphic takes 1 image; 0 provided\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/checks passed/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Download package' }));
    expect(
      await screen.findByText(/^Saved mulligan-\d{4}-\d{2}-\d{2}-\d{4}\.zip \(/),
    ).toBeInTheDocument();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/^mulligan-.*\.zip$/);
  });

  it('packages a listing on its own and shows its status', async () => {
    useListingStore.getState().setInput('apple.name', { text: 'Example Health' });
    renderPanel();
    const rows = within(screen.getByRole('table'))
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent);
    expect(rows).toEqual(['listing/2', 'manifest.json1']);
    const listing = screen.getByRole('region', { name: 'Listing' });
    expect(listing).toHaveTextContent(/\d+ failures? in the listing; see the Listing tab/);
    await userEvent.click(screen.getByRole('button', { name: 'Download package' }));
    expect(await screen.findByText(/^Saved mulligan-/)).toBeInTheDocument();
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
