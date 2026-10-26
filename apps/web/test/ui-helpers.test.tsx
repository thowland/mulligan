import type { Finding } from '@mulligan/core';
import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FindingList } from '../src/ui/FindingList.tsx';
import { readFileBytes, saveBytes, useObjectUrl } from '../src/ui/files.ts';

const finding = (severity: Finding['severity'], message: string): Finding => ({
  ruleId: 'image.upscaled',
  severity,
  subject: { kind: 'package' },
  message,
});

afterEach(() => vi.restoreAllMocks());

describe('FindingList', () => {
  it('lists failures before warnings and summarises passes', () => {
    render(
      <FindingList
        findings={[finding('warning', 'W'), finding('pass', 'P1'), finding('failure', 'F')]}
      />,
    );
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['FailureF', 'WarningW', 'Pass1 check passed']);
  });

  it('pluralises the pass count and can show passes individually', () => {
    const { rerender } = render(
      <FindingList findings={[finding('pass', 'P1'), finding('pass', 'P2')]} />,
    );
    expect(screen.getByText('2 checks passed')).toBeInTheDocument();
    rerender(<FindingList findings={[finding('pass', 'P1'), finding('pass', 'P2')]} showPasses />);
    expect(screen.getByText('P1')).toBeInTheDocument();
    expect(screen.queryByText(/checks passed/)).not.toBeInTheDocument();
  });

  it('renders an empty list for no findings', () => {
    render(<FindingList findings={[]} />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});

describe('file helpers', () => {
  it('saves bytes through a temporary blob URL', () => {
    vi.useFakeTimers();
    const create = vi.spyOn(URL, 'createObjectURL');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    saveBytes(Uint8Array.of(1, 2, 3), 'image/png', 'out.png');
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('manages object URLs for changing bytes, revoking once unused', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    function Probe({ bytes }: { bytes: Uint8Array | null }) {
      return <span data-testid="url">{useObjectUrl(bytes, 'image/png') ?? 'none'}</span>;
    }
    const { rerender, unmount } = render(<Probe bytes={null} />);
    expect(screen.getByTestId('url')).toHaveTextContent('none');
    rerender(<Probe bytes={Uint8Array.of(1)} />);
    const url = screen.getByTestId('url').textContent!;
    expect(url).toMatch(/^blob:/);
    rerender(<Probe bytes={null} />);
    expect(screen.getByTestId('url')).toHaveTextContent('none');
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith(url));
    unmount();
  });

  it('keeps a URL through StrictMode effect re-runs and revokes it on unmount', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const bytes = Uint8Array.of(1, 2);
    function Probe({ id }: { id: string }) {
      return <span data-testid={id}>{useObjectUrl(bytes, 'image/png')}</span>;
    }
    function Pair({ both }: { both: boolean }) {
      return (
        <>
          <Probe id="a" />
          {both && <Probe id="b" />}
        </>
      );
    }
    const { rerender, unmount } = render(
      <StrictMode>
        <Pair both />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <Pair both={false} />
      </StrictMode>,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    const url = screen.getByTestId('a').textContent!;
    expect(revoke).not.toHaveBeenCalledWith(url);
    unmount();
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith(url));
  });

  it('reads file bytes', async () => {
    const bytes = await readFileBytes(new File([Uint8Array.of(7, 8)], 'a.bin'));
    expect(Array.from(bytes)).toEqual([7, 8]);
  });
});
