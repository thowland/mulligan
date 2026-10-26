import { getStandards } from '@mulligan/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';

describe('App shell', () => {
  it('opens on the Images tab with the screenshot workbench and the other presets', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mulligan' })).toBeInTheDocument();
    const panel = screen.getByRole('tabpanel', { name: 'Images' });
    const presets = getStandards().presets;
    for (const preset of presets.filter((p) => p.group === 'screenshot')) {
      expect(
        within(panel).getByRole('checkbox', { name: new RegExp(preset.name) }),
      ).toBeInTheDocument();
    }
    for (const preset of presets.filter((p) => p.group !== 'screenshot')) {
      expect(within(panel).getByText(preset.name)).toBeInTheDocument();
    }
    expect(within(panel).getByRole('heading', { name: 'Screenshots' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Choose a screenshot' })).toBeInTheDocument();
    expect(within(panel).getAllByText('Centered crop · up to 1 file')).toHaveLength(2);
    expect(within(panel).getByText('1 MB')).toBeInTheDocument();
    expect(within(panel).getAllByText('Selected by default').length).toBeGreaterThan(0);
  });

  it('lists every listing field with its limit on the Listing tab', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: 'Listing' }));
    const panel = screen.getByRole('tabpanel', { name: 'Listing' });
    expect(within(panel).getAllByRole('row')).toHaveLength(getStandards().fields.length + 2);
    const keywords = within(panel).getByRole('rowheader', { name: 'Keywords' }).closest('tr')!;
    expect(within(keywords).getByText('100 bytes')).toBeInTheDocument();
    const name = within(panel).getByRole('rowheader', { name: 'App name' }).closest('tr')!;
    expect(within(name).getByText('2–30 characters')).toBeInTheDocument();
    expect(within(name).getByText('Single line')).toBeInTheDocument();
    expect(within(name).getByText('Required')).toBeInTheDocument();
    const promo = within(panel).getByRole('rowheader', { name: 'Promotional text' }).closest('tr')!;
    expect(within(promo).getByText('Multi-line')).toBeInTheDocument();
    expect(within(promo).getByText('Optional')).toBeInTheDocument();
  });

  it('shows the empty package state on the Package tab', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: 'Package' }));
    expect(screen.getByRole('heading', { name: 'Nothing to package yet' })).toBeInTheDocument();
  });

  it('toggles the About panel with versions and the standards hash', async () => {
    render(<App />);
    const about = screen.getByRole('button', { name: 'About' });
    expect(about).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'About Mulligan' })).not.toBeInTheDocument();
    await userEvent.click(about);
    expect(about).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('region', { name: 'About Mulligan' });
    expect(within(panel).getByText(/^sha256:/)).toBeInTheDocument();
    expect(within(panel).getByText(getStandards().rulesetVersion)).toBeInTheDocument();
    await userEvent.click(about);
    expect(about).toHaveAttribute('aria-expanded', 'false');
  });
});
