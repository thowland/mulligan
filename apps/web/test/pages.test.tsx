import { RULES, getStandards } from '@mulligan/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SESSION } from '../src/config.ts';
import {
  AboutPage,
  CANONICAL_URL,
  CONTACT_EMAIL,
  SOURCE_URL,
} from '../src/features/pages/AboutPage.tsx';
import { HelpPage } from '../src/features/pages/HelpPage.tsx';
import { RULE_NOTES, ruleNote } from '../src/features/pages/ruleNotes.ts';

const context = () => ({ input: getStandards().input, rules: getStandards().rules });

describe('rule notes', () => {
  it('explain every rule in the catalog, and only those', () => {
    expect(Object.keys(RULE_NOTES).sort()).toEqual(Object.keys(RULES).sort());
    for (const id of Object.keys(RULES)) {
      expect(ruleNote(id, context()), id).toMatch(/\S.*\.$/);
    }
    expect(ruleNote('nope', context())).toBeUndefined();
  });

  it('take their values from the standards', () => {
    const base = context();
    const rules = {
      ...base.rules,
      discouraged: {
        ...base.rules.discouraged,
        terms: ['gratis'],
        allCaps: { minLetters: 5, allow: ['FDA'] },
      },
    };
    const input = { ...base.input, upscaleWarnAbove: 1.5, cropLossWarnAbove: 0.4 };
    expect(ruleNote('text.discouraged.terms', { input, rules })).toContain('“gratis”');
    expect(ruleNote('text.discouraged.all-caps', { input, rules })).toMatch(
      /5 or more letters.*Allowed: FDA\./,
    );
    expect(ruleNote('text.discouraged.all-caps', base)).not.toContain('Allowed');
    expect(ruleNote('image.upscaled', { input, rules })).toContain('more than 1.5×');
    expect(ruleNote('image.upscaled', base)).not.toContain('more than');
    expect(ruleNote('image.crop-loss', { input, rules })).toContain('More than 40%');
    expect(ruleNote('image.too-large', base)).toContain('50 MB');
  });
});

describe('Help page', () => {
  it('lists every preset and field from the standards', () => {
    render(<HelpPage onDone={() => {}} />);
    const s = getStandards();
    for (const preset of s.presets) {
      expect(screen.getByRole('rowheader', { name: preset.name })).toBeInTheDocument();
    }
    for (const field of s.fields) {
      expect(screen.getAllByRole('rowheader', { name: field.label }).length).toBeGreaterThan(0);
    }
    // Copy from iOS sources appear in the Google Play table.
    const titleRow = screen.getByRole('rowheader', { name: 'App title' }).closest('tr')!;
    expect(titleRow).toHaveTextContent('App name');
  });

  it('describes each rule with its severity or revert option', () => {
    render(<HelpPage onDone={() => {}} />);
    for (const rule of Object.values(RULES)) {
      expect(screen.getAllByText(rule.title, { exact: false }).length, rule.id).toBeGreaterThan(0);
    }
    const emoji = screen.getByText('Emoji removed').closest('div')!;
    expect(emoji).toHaveTextContent('can be reverted');
    const limit = screen.getByText('Text exceeds the field limit').closest('div')!;
    expect(limit).toHaveTextContent('failure');
  });

  it('explains where work is kept and how to reset it, with the configured limits', () => {
    render(<HelpPage onDone={() => {}} />);
    const storage = screen.getByRole('region', { name: 'Where your work is kept' });
    expect(storage).toHaveTextContent(`${SESSION.retentionDays} days`);
    expect(storage).toHaveTextContent('500 MB');
    const reset = screen.getByRole('region', { name: 'Resetting your work' });
    expect(within(reset).getByText(/Clear session in the header/)).toBeInTheDocument();
    for (const browser of ['Chrome and Edge', 'Safari', 'Firefox']) {
      expect(reset).toHaveTextContent(browser);
    }
    for (const link of within(
      screen.getByRole('navigation', { name: 'Help contents' }),
    ).getAllByRole('link')) {
      const id = link.getAttribute('href')!.slice(1);
      expect(document.getElementById(id), id).not.toBeNull();
    }
  });
});

describe('About page', () => {
  it('names the author, contact, source and license, and the versions', () => {
    const onDone = vi.fn();
    render(<AboutPage onDone={onDone} />);
    expect(screen.getByRole('link', { name: CONTACT_EMAIL })).toHaveAttribute(
      'href',
      'mailto:th@wdogsystems.com',
    );
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', SOURCE_URL);
    expect(SOURCE_URL).toBe('https://github.com/thowland/mulligan');
    expect(screen.getByRole('link', { name: 'GNU General Public License' })).toHaveAttribute(
      'rel',
      'noreferrer',
    );
    expect(screen.getByText(/written by Tim Howland/)).toBeInTheDocument();
    expect(screen.getByText(getStandards().rulesetVersion)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'mulligan.beta-site.us' })).toHaveAttribute(
      'href',
      CANONICAL_URL,
    );
    expect(screen.getByText('local')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Back to workspace' }).click();
    expect(onDone).toHaveBeenCalledOnce();
  });
});
