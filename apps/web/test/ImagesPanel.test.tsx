import type { RenderedImage } from '@mulligan/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImagesPanel } from '../src/features/images/ImagesPanel.tsx';
import { RenderCacheContext, renderKey, type RenderCache } from '../src/render/cache.ts';
import { useImageStore } from '../src/state/images.ts';
import { fakeCache, fakeRender, imageFile, pngFile } from './helpers/images.ts';
import { planFor } from '../src/core-bridge/images.ts';

function renderPanel(cache: RenderCache = fakeCache()) {
  return render(
    <RenderCacheContext.Provider value={() => cache}>
      <ImagesPanel />
    </RenderCacheContext.Provider>,
  );
}

const upload = (groupId: string, ...files: File[]) =>
  userEvent.upload(screen.getByTestId(`file-input-${groupId}`), files);
const card = (preset: string, file: string) =>
  screen.findByRole('article', { name: `${preset}, ${file}` });
const listNames = () =>
  screen
    .getAllByRole('listitem')
    .filter((li) => li.querySelector('strong'))
    .map((li) => li.querySelector('strong')!.textContent);

let clicked: string[] = [];
beforeEach(() => {
  useImageStore.getState().reset();
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this.download);
  });
});
afterEach(() => vi.restoreAllMocks());

describe('ImagesPanel', () => {
  it('shows a section per group with its presets', () => {
    renderPanel();
    for (const heading of ['Screenshots', 'Feature graphic', 'App icon']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Add screenshots' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose feature graphic' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Apple App Store icon/ })).toBeChecked();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('lists screenshots in upload order and previews each with every selected preset', async () => {
    const cache = fakeCache();
    renderPanel(cache);
    await upload(
      'screenshot',
      imageFile('b.png', pngFile(1290, 12000)),
      imageFile('a.png', pngFile(1320, 2868)),
    );
    await card('iPhone 6.9" screenshot', 'a.png');
    expect(listNames()).toEqual(['b.png', 'a.png']);
    expect(screen.getByLabelText('Position 01')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);

    const iphoneB = await card('iPhone 6.9" screenshot', 'b.png');
    expect(await within(iphoneB).findByText('Ready with warnings')).toBeInTheDocument();
    expect(within(iphoneB).getByText(/Upscaled 1\.02×/)).toBeInTheDocument();
    expect(
      await within(iphoneB).findByRole('img', { name: /result for b\.png/ }),
    ).toBeInTheDocument();
    const iphoneA = await card('iPhone 6.9" screenshot', 'a.png');
    await within(iphoneA).findByText('Ready');
    await userEvent.click(within(iphoneA).getByRole('button', { name: 'Download' }));
    expect(clicked).toEqual(['iphone-6.9_02_a.png']);
    expect(within(iphoneA).getByText(/^PNG · /)).toBeInTheDocument();
  });

  it('reorders with the Move buttons, removes sources and prunes stale renders', async () => {
    const cache = fakeCache();
    renderPanel(cache);
    await upload(
      'screenshot',
      // Distinct bytes: identical files would share one render (by hash).
      imageFile('a.png', pngFile(1320, 2868)),
      imageFile('b.png', pngFile(1321, 2868)),
      imageFile('c.png', pngFile(1322, 2868)),
    );
    await card('iPhone 6.9" screenshot', 'c.png');
    expect(screen.getByRole('button', { name: 'Move a.png up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move c.png down' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move c.png up' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move a.png down' }));
    expect(listNames()).toEqual(['c.png', 'a.png', 'b.png']);
    expect(
      within(await card('iPhone 6.9" screenshot', 'a.png')).getByText('iphone-6.9_02_a.png'),
    ).toBeInTheDocument();

    const removed = useImageStore
      .getState()
      .sources['screenshot']!.find((s) => s.fileName === 'c.png')!;
    await userEvent.click(screen.getByRole('button', { name: 'Remove c.png' }));
    expect(listNames()).toEqual(['a.png', 'b.png']);
    const lastPrune = vi.mocked(cache.prune).mock.calls.at(-1)![0];
    expect(lastPrune.has(renderKey(removed, 'iphone-6.9'))).toBe(false);
    expect(lastPrune.size).toBe(4);
  });

  it('changes one group’s presets without touching the others', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('checkbox', { name: /iPad 13" screenshot/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Google Play app icon/ }));
    expect(useImageStore.getState().selectedPresetIds).toEqual([
      'iphone-6.9',
      'ipad-13',
      'android-phone',
      'play-feature-graphic',
      'apple-icon',
    ]);
    await upload('screenshot', imageFile('a.png', pngFile(1320, 2868)));
    await card('iPad 13" screenshot', 'a.png');
    for (const name of [/iPhone 6\.9"/, /iPad 13"/, /Android phone/]) {
      await userEvent.click(screen.getByRole('checkbox', { name }));
    }
    expect(
      screen.getByText('Select at least one output size to see previews.'),
    ).toBeInTheDocument();
  });

  it('asks before replacing the icon', async () => {
    renderPanel();
    await upload('icon', imageFile('old.png', pngFile(1024, 1024)));
    expect(await screen.findByText('old.png')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace app icon' })).toBeInTheDocument();
    await upload('icon', imageFile('new.png', pngFile(1024, 1024)));
    const prompt = await screen.findByRole('alertdialog');
    expect(prompt).toHaveTextContent('Replace old.png with new.png?');
    await userEvent.click(within(prompt).getByRole('button', { name: 'Keep current' }));
    expect(screen.getByText('old.png')).toBeInTheDocument();
    await upload('icon', imageFile('new.png', pngFile(1024, 1024)));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Replace' }),
    );
    expect(screen.getByText('new.png')).toBeInTheDocument();
    expect(screen.queryByText('old.png')).not.toBeInTheDocument();
  });

  it('reports rejected files and lets them be dismissed', async () => {
    renderPanel();
    await upload('screenshot', imageFile('page.png', new TextEncoder().encode('<html>')));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('page.png was not added. Not a PNG or JPEG file.');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss message about page.png' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('accepts dropped files and highlights the zone only for file drags', async () => {
    renderPanel();
    const zone = screen.getByRole('button', { name: 'Add screenshots' }).parentElement!;
    fireEvent.dragOver(zone, { dataTransfer: { types: ['text/uri-list'] } });
    expect(zone).toHaveAttribute('data-active', 'false');
    fireEvent.dragOver(zone, { dataTransfer: { types: ['Files'], dropEffect: 'none' } });
    expect(zone).toHaveAttribute('data-active', 'true');
    fireEvent.dragLeave(zone);
    expect(zone).toHaveAttribute('data-active', 'false');
    await act(async () => {
      fireEvent.drop(zone, {
        dataTransfer: {
          files: [imageFile('d1.png', pngFile(10, 10)), imageFile('d2.png', pngFile(10, 10))],
        },
      });
    });
    expect(await screen.findByText('d2.png')).toBeInTheDocument();
    fireEvent.drop(zone, { dataTransfer: { files: [] } });
    expect(listNames()).toEqual(['d1.png', 'd2.png']);
  });

  it('opens the file picker from the zone button', async () => {
    renderPanel();
    const click = vi.spyOn(screen.getByTestId('file-input-icon'), 'click');
    await userEvent.click(screen.getByRole('button', { name: 'Choose app icon' }));
    expect(click).toHaveBeenCalled();
  });

  it('shows decode failures and unexpected errors, and ignores cancellations', async () => {
    const decode = Object.assign(new Error('The image could not be decoded (bad).'), {
      name: 'DecodeError',
    });
    renderPanel(
      fakeCache({
        preview: (source, presetId) => {
          if (presetId === 'iphone-6.9') return Promise.reject(decode);
          if (presetId === 'android-phone') return Promise.reject(new Error('out of memory'));
          return Promise.reject(new DOMException('cancelled', 'AbortError'));
        },
      }),
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /iPad 13"/ }));
    await upload('screenshot', imageFile('a.png', pngFile(1320, 2868)));
    const iphone = await card('iPhone 6.9" screenshot', 'a.png');
    expect(await within(iphone).findByText('Failed')).toBeInTheDocument();
    expect(within(iphone).getByText('The image could not be decoded (bad).')).toBeInTheDocument();
    expect(within(iphone).getByRole('button', { name: 'Download' })).toBeDisabled();
    const android = await card('Android phone screenshot', 'a.png');
    expect(await within(android).findByText('Rendering failed: out of memory')).toBeInTheDocument();
    expect(
      within(await card('iPad 13" screenshot', 'a.png')).getByRole('status'),
    ).toHaveTextContent('Rendering…');
  });

  it('ignores results that arrive after a card is removed', async () => {
    const pending: (() => void)[] = [];
    renderPanel(
      fakeCache({
        preview: (source, presetId) =>
          new Promise<RenderedImage>((resolve) => {
            pending.push(() => {
              void fakeRender({
                source: source.bytes,
                plan: planFor(source, presetId),
                preview: { maxEdge: 480 },
              }).then(resolve);
            });
          }),
      }),
    );
    await upload('screenshot', imageFile('a.png', pngFile(1320, 2868)));
    await card('iPhone 6.9" screenshot', 'a.png');
    await userEvent.click(screen.getByRole('button', { name: 'Remove a.png' }));
    await act(async () => pending.forEach((release) => release()));
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('ignores a full render that finishes after the card is removed', async () => {
    let finish: (() => void) | undefined;
    const healthy = fakeCache();
    renderPanel(
      fakeCache({
        full: (source, presetId) =>
          new Promise((resolve) => {
            finish ??= () => void healthy.full(source, presetId).then(resolve);
          }),
      }),
    );
    await upload('screenshot', imageFile('a.png', pngFile(1320, 2868)));
    await vi.waitFor(() => expect(finish).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: 'Remove a.png' }));
    await act(async () => finish!());
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });
});
