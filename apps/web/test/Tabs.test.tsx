import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Tabs, type TabDef } from '../src/ui/Tabs.tsx';

const TABS: TabDef[] = [
  { id: 'a', label: 'Alpha', content: <p>Alpha content</p> },
  { id: 'b', label: 'Beta', content: <p>Beta content</p> },
  { id: 'c', label: 'Gamma', content: <p>Gamma content</p> },
];

function Harness() {
  const [selected, setSelected] = useState('a');
  return <Tabs tabs={TABS} selected={selected} onSelect={setSelected} label="Test tabs" />;
}

describe('Tabs', () => {
  it('shows the selected panel only, labelled by its tab', () => {
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: 'Test tabs' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Alpha' })).toHaveTextContent('Alpha content');
    expect(screen.queryByText('Beta content')).not.toBeInTheDocument();
  });

  it('selects a tab on click', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Beta content')).toBeVisible();
  });

  it('supports arrow, Home and End keys with wrap-around and roving focus', async () => {
    render(<Harness />);
    const alpha = screen.getByRole('tab', { name: 'Alpha' });
    alpha.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Gamma' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(alpha).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Gamma' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Home}');
    expect(alpha).toHaveAttribute('aria-selected', 'true');
    expect(alpha).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('tabindex', '-1');
  });

  it('ignores other keys', async () => {
    render(<Harness />);
    screen.getByRole('tab', { name: 'Alpha' }).focus();
    await userEvent.keyboard('x');
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
  });
});
