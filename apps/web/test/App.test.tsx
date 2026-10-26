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

  it('opens Help and About in place of the workspace, which stays mounted', async () => {
    render(<App />);
    const pages = screen.getByRole('navigation', { name: 'Pages' });
    const help = within(pages).getByRole('button', { name: 'Help' });
    await userEvent.click(help);
    expect(screen.getByRole('heading', { level: 2, name: 'Help' })).toHaveFocus();
    expect(help).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    // Hidden, not unmounted: the tab state is kept.
    expect(screen.getByRole('tablist', { hidden: true })).toBeInTheDocument();

    const about = within(pages).getByRole('button', { name: 'About' });
    await userEvent.click(about);
    expect(screen.getByRole('heading', { level: 2, name: 'About Mulligan' })).toHaveFocus();
    expect(screen.queryByRole('heading', { level: 2, name: 'Help' })).not.toBeInTheDocument();
    expect(screen.getByText(/^sha256:/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back to workspace' }));
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(about).toHaveFocus();

    // The current page's link also returns to the workspace.
    await userEvent.click(help);
    await userEvent.click(help);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
