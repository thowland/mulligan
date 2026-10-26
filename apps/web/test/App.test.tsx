import { getStandards } from '@mulligan/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';

describe('App shell', () => {
  it('opens on the Images tab with a section and preset checkboxes for every group', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mulligan' })).toBeInTheDocument();
    const panel = screen.getByRole('tabpanel', { name: 'Images' });
    for (const preset of getStandards().presets) {
      expect(within(panel).getByRole('checkbox', { name: new RegExp(preset.name) })).toHaveProperty(
        'checked',
        preset.defaultSelected,
      );
    }
    for (const group of getStandards().groups) {
      expect(within(panel).getByRole('heading', { name: group.label })).toBeInTheDocument();
    }
    expect(within(panel).getByRole('button', { name: 'Add screenshots' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Choose app icon' })).toBeInTheDocument();
    expect(within(panel).getAllByText('Centered crop · up to 1 file')).toHaveLength(2);
  });

  it('shows an editor for every listing field on the Listing tab, keeping input across tabs', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: 'Listing' }));
    const panel = screen.getByRole('tabpanel', { name: 'Listing' });
    expect(within(panel).getAllByRole('article')).toHaveLength(getStandards().fields.length);
    expect(within(panel).getByRole('heading', { name: 'Apple App Store' })).toBeInTheDocument();
    const name = within(panel).getByRole('article', { name: 'App name' });
    expect(within(name).getByText(/2–30 characters · single line · required/)).toBeInTheDocument();

    await userEvent.type(within(name).getByRole('textbox'), 'Example');
    await userEvent.click(screen.getByRole('tab', { name: 'Images' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Listing' }));
    const again = screen.getByRole('article', { name: 'App name' });
    expect(within(again).getByRole('textbox')).toHaveValue('Example');
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
