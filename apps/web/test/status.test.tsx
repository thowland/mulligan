import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { useWorkspaceStatus } from '../src/features/status/useWorkspaceStatus.ts';
import { renderKey } from '../src/render/cache.ts';
import { noticeId, useImageStore } from '../src/state/images.ts';
import { useListingStore } from '../src/state/listing.ts';
import { useOutcomeStore } from '../src/state/outcomes.ts';
import { StatusBar, statusText } from '../src/ui/StatusBar.tsx';
import { sourceEntry } from './helpers/images.ts';

const versions = { libraryVersion: '0.1.0', rulesetVersion: '1.0.0', standardsHash: 'sha256:x' };

function Probe() {
  const status = useWorkspaceStatus(0);
  return <StatusBar versions={versions} status={status} />;
}

const bar = () => screen.getByRole('status');

describe('statusText', () => {
  it('words every state', () => {
    expect(statusText({ worst: 'idle', warnings: 0, failures: 0 })).toBe('Ready');
    expect(statusText({ worst: 'pass', warnings: 0, failures: 0 })).toBe('All checks pass');
    expect(statusText({ worst: 'warning', warnings: 1, failures: 0 })).toBe('1 warning');
    expect(statusText({ worst: 'warning', warnings: 3, failures: 0 })).toBe('3 warnings');
    expect(statusText({ worst: 'failure', warnings: 0, failures: 1 })).toBe('1 failure');
    expect(statusText({ worst: 'failure', warnings: 2, failures: 4 })).toBe(
      '4 failures · 2 warnings',
    );
  });
});

describe('workspace status', () => {
  it('is Ready until something is added', () => {
    render(<Probe />);
    expect(bar()).toHaveTextContent('Ready');
    expect(bar()).toHaveAttribute('data-status', 'idle');
  });

  it('counts listing findings once the listing has copy', () => {
    render(<Probe />);
    act(() => useListingStore.getState().setInput('apple.name', { text: 'BEST App!!' }));
    expect(bar()).toHaveAttribute('data-status', 'failure');
    expect(bar().textContent).toMatch(/^\d+ failures? · \d+ warnings?$/);
  });

  it('passes when images plan cleanly and the package is complete', () => {
    const store = useImageStore.getState();
    store.setSelectedPresets(['iphone-6.3']);
    store.addSources('screenshot', [sourceEntry('a.png')]);
    render(<Probe />);
    expect(bar()).toHaveTextContent('All checks pass');
  });

  it('includes planning warnings, count checks and verified render outcomes', () => {
    const store = useImageStore.getState();
    store.setSelectedPresets(['iphone-6.3']);
    const small = sourceEntry('small.png', 660, 1434);
    store.addSources('screenshot', [small]);
    render(<Probe />);
    expect(bar()).toHaveTextContent('1 warning');

    act(() =>
      useOutcomeStore.getState().report(renderKey(small, 'iphone-6.3'), [
        {
          ruleId: 'image.output.size',
          severity: 'failure',
          subject: { kind: 'package' },
          message: 'too big',
        },
      ]),
    );
    expect(bar()).toHaveTextContent('1 failure · 1 warning');
  });

  it('counts rejected files as warnings', () => {
    useImageStore
      .getState()
      .addNotices([{ id: noticeId(), groupId: 'screenshot', fileName: 'x.gif', messages: ['no'] }]);
    render(<Probe />);
    expect(bar()).toHaveTextContent('1 warning');
    expect(bar()).toHaveAttribute('data-status', 'warning');
  });
});
