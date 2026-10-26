import type { RenderRequest, RenderedImage } from '@mulligan/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImagesPanel } from '../src/features/images/ImagesPanel.tsx';
import { RenderServiceContext, type RenderService } from '../src/render/service.ts';
import { fakeRender, fakeService, imageFile, pngFile } from './helpers/images.ts';

function renderPanel(service: RenderService = fakeService()) {
  return render(
    <RenderServiceContext.Provider value={service}>
      <ImagesPanel />
    </RenderServiceContext.Provider>,
  );
}

const upload = (file: File) => userEvent.upload(screen.getByTestId('file-input'), file);
const card = (name: string) => screen.findByRole('article', { name });

let clicked: string[] = [];
beforeEach(() => {
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this.download);
  });
});
afterEach(() => vi.restoreAllMocks());

describe('ImagesPanel', () => {
  it('starts with the default screenshot presets selected and no previews', () => {
    renderPanel();
    expect(screen.getByRole('checkbox', { name: /iPhone 6\.9" screenshot/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Android phone screenshot/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /iPad 13" screenshot/ })).not.toBeChecked();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Other outputs' })).toBeInTheDocument();
    expect(screen.getByText('Google Play feature graphic')).toBeInTheDocument();
  });

  it('previews, verifies and downloads each selected preset', async () => {
    const service = fakeService();
    renderPanel(service);
    await upload(imageFile('Home Screen.png', pngFile(1290, 12000)));

    expect(await screen.findByText('Home Screen.png')).toBeInTheDocument();
    expect(screen.getByText('1290 × 12000 · PNG')).toBeInTheDocument();
    const iphone = await card('iPhone 6.9" screenshot');
    expect(within(iphone).getByText('Crop 1290 × 2803 at 0, 0')).toBeInTheDocument();
    expect(await within(iphone).findByText('Ready with warnings')).toBeInTheDocument();
    expect(within(iphone).getByText(/Upscaled 1\.02×/)).toBeInTheDocument();
    expect(within(iphone).getByText(/checks passed/)).toBeInTheDocument();
    expect(
      await within(iphone).findByRole('img', { name: 'iPhone 6.9" screenshot result' }),
    ).toBeInTheDocument();

    const android = await card('Android phone screenshot');
    expect(await within(android).findByText('Ready')).toBeInTheDocument();

    // One preview and one full render per card.
    expect(service.calls.filter((c) => c.preview)).toHaveLength(2);
    expect(service.calls.filter((c) => !c.preview)).toHaveLength(2);

    await userEvent.click(within(iphone).getByRole('button', { name: 'Download' }));
    expect(clicked).toEqual(['iphone-6.9_01_home-screen.png']);
  });

  it('adds and removes cards as presets are toggled', async () => {
    renderPanel();
    await upload(imageFile('a.png', pngFile(1320, 2868)));
    await card('iPhone 6.9" screenshot');
    await userEvent.click(screen.getByRole('checkbox', { name: /iPad 13" screenshot/ }));
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-labelledby'))).toEqual([
      'preview-iphone-6.9',
      'preview-ipad-13',
      'preview-android-phone',
    ]);
    await userEvent.click(screen.getByRole('checkbox', { name: /iPhone 6\.9" screenshot/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /iPad 13" screenshot/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Android phone screenshot/ }));
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(
      screen.getByText('Select at least one output size to see previews.'),
    ).toBeInTheDocument();
  });

  it('rejects files that are not PNG or JPEG', async () => {
    renderPanel();
    await upload(imageFile('page.png', new TextEncoder().encode('<html></html>')));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('page.png could not be used.');
    expect(alert).toHaveTextContent('Not a PNG or JPEG file.');
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('replaces and removes the screenshot', async () => {
    renderPanel();
    await upload(imageFile('first.png', pngFile(1320, 2868)));
    await upload(imageFile('second.png', pngFile(1080, 1920)));
    expect(await screen.findByText('second.png')).toBeInTheDocument();
    expect(screen.queryByText('first.png')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByText('second.png')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose a screenshot' })).toBeInTheDocument();
  });

  it('accepts dropped files and highlights the zone only for file drags', async () => {
    renderPanel();
    const zone = screen.getByRole('button', { name: 'Choose a screenshot' }).parentElement!;
    fireEvent.dragOver(zone, { dataTransfer: { types: ['text/uri-list'] } });
    expect(zone).toHaveAttribute('data-active', 'false');
    fireEvent.dragOver(zone, { dataTransfer: { types: ['Files'], dropEffect: 'none' } });
    expect(zone).toHaveAttribute('data-active', 'true');
    fireEvent.dragLeave(zone);
    expect(zone).toHaveAttribute('data-active', 'false');
    const file = imageFile('dropped.png', pngFile(1320, 2868));
    await act(async () => {
      fireEvent.drop(zone, {
        dataTransfer: { files: [file, imageFile('extra.png', pngFile(1, 1))] },
      });
    });
    expect(await screen.findByText('dropped.png')).toBeInTheDocument();
    fireEvent.drop(zone, { dataTransfer: { files: [] } });
    expect(screen.getByText('dropped.png')).toBeInTheDocument();
  });

  it('opens the file picker from the button', async () => {
    renderPanel();
    const input = screen.getByTestId('file-input');
    const click = vi.spyOn(input, 'click');
    await userEvent.click(screen.getByRole('button', { name: 'Choose a screenshot' }));
    expect(click).toHaveBeenCalled();
  });

  it('shows a decode failure from the renderer', async () => {
    const error = Object.assign(new Error('The image could not be decoded (bad).'), {
      name: 'DecodeError',
    });
    renderPanel(fakeService(() => Promise.reject(error)));
    await upload(imageFile('broken.png', pngFile(1320, 2868)));
    const iphone = await card('iPhone 6.9" screenshot');
    expect(await within(iphone).findByText('Failed')).toBeInTheDocument();
    expect(within(iphone).getByText('The image could not be decoded (bad).')).toBeInTheDocument();
    expect(within(iphone).getByRole('button', { name: 'Download' })).toBeDisabled();
  });

  it('reports unexpected renderer errors', async () => {
    renderPanel(fakeService(() => Promise.reject('worker crashed')));
    await upload(imageFile('a.png', pngFile(1320, 2868)));
    expect(
      await within(await card('iPhone 6.9" screenshot')).findByText(
        'Rendering failed: worker crashed',
      ),
    ).toBeInTheDocument();
  });

  it('reports unexpected Error objects', async () => {
    renderPanel(fakeService(() => Promise.reject(new Error('out of memory'))));
    await upload(imageFile('a.png', pngFile(1320, 2868)));
    expect(
      await within(await card('Android phone screenshot')).findByText(
        'Rendering failed: out of memory',
      ),
    ).toBeInTheDocument();
  });

  it('shows JPEG output details', async () => {
    renderPanel(
      fakeService(async (request) => ({ ...(await fakeRender(request)), mimeType: 'image/jpeg' })),
    );
    await upload(imageFile('a.png', pngFile(1320, 2868)));
    expect(
      await within(await card('iPhone 6.9" screenshot')).findByText(/^JPEG · /),
    ).toBeInTheDocument();
  });

  it('ignores results that arrive after a card is removed', async () => {
    const pending: ((value: RenderedImage) => void)[] = [];
    const requests: RenderRequest[] = [];
    renderPanel(
      fakeService(
        (request) =>
          new Promise((resolve) => {
            requests.push(request);
            pending.push(resolve);
          }),
      ),
    );
    await upload(imageFile('a.png', pngFile(1320, 2868)));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const results = await Promise.all(requests.map((r) => fakeRender(r)));
    await act(async () => {
      pending.forEach((resolve, i) => resolve(results[i]!));
    });
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('ignores a full render that finishes after the card is removed', async () => {
    let resolveFull: ((value: RenderedImage) => void) | undefined;
    let fullRequest: RenderRequest | undefined;
    renderPanel(
      fakeService((request) => {
        if (request.preview) return fakeRender(request);
        fullRequest = request;
        return new Promise((resolve) => {
          resolveFull = resolve;
        });
      }),
    );
    await upload(imageFile('a.png', pngFile(1320, 2868)));
    await vi.waitFor(() => expect(resolveFull).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const result = await fakeRender(fullRequest!);
    await act(async () => resolveFull!(result));
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('ignores a failure that arrives after the card is removed', async () => {
    let rejectRender: ((reason: unknown) => void) | undefined;
    renderPanel(
      fakeService(
        () =>
          new Promise((_resolve, reject) => {
            rejectRender ??= reject;
          }),
      ),
    );
    await upload(imageFile('a.png', pngFile(1320, 2868)));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await act(async () => rejectRender!(new Error('late')));
    expect(screen.queryByText(/late/)).not.toBeInTheDocument();
  });
});
