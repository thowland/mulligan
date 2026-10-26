import type { Finding, Severity } from '@mulligan/core';
import { useMemo } from 'react';
import { allGroups, planFor, presetsInGroup, worstOf } from '../../core-bridge/images.ts';
import { hasListingInput, listingFindings } from '../../core-bridge/listing.ts';
import { groupCountFindings, packagePlan } from '../../core-bridge/package.ts';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.ts';
import { renderKey } from '../../render/cache.ts';
import { useImageStore } from '../../state/images.ts';
import { useListingStore } from '../../state/listing.ts';
import { useOutcomeStore } from '../../state/outcomes.ts';
import { LISTING_DEBOUNCE_MS } from '../listing/ListingPanel.tsx';

export interface WorkspaceStatus {
  /** 'idle' until images or listing copy have been added. */
  worst: Severity | 'idle';
  warnings: number;
  failures: number;
}

const count = (findings: readonly Finding[], severity: Severity) =>
  findings.filter((f) => f.severity === severity).length;

export interface WorkspaceFindings {
  /** Planning and verified-render findings per selected output, plus package counts and layout. */
  images: Finding[];
  /** Listing findings, once the listing has copy. */
  listing: Finding[];
  /** Files rejected on intake. */
  rejected: number;
}

/** Every finding in the workspace (spec §9.3): images, package and listing. */
export function useWorkspaceFindings(debounceMs = LISTING_DEBOUNCE_MS): WorkspaceFindings {
  const sources = useImageStore((s) => s.sources);
  const presetIds = useImageStore((s) => s.selectedPresetIds);
  const notices = useImageStore((s) => s.notices);
  const outcomes = useOutcomeStore((s) => s.byKey);
  const inputs = useListingStore((s) => s.inputs);
  const straightQuotes = useListingStore((s) => s.straightQuotes);
  const reverted = useListingStore((s) => s.reverted);
  const draft = useMemo(
    () => ({ inputs, straightQuotes, reverted }),
    [inputs, straightQuotes, reverted],
  );
  const settled = useDebouncedValue(draft, debounceMs);

  const listing = useMemo(
    () => (hasListingInput(settled.inputs) ? listingFindings(settled) : []),
    [settled],
  );

  const images = useMemo(() => {
    const selected = new Set(presetIds);
    const findings: Finding[] = [];
    for (const group of allGroups()) {
      const list = sources[group.id] ?? [];
      for (const preset of presetsInGroup(group.id).filter((p) => selected.has(p.id))) {
        for (const source of list) {
          findings.push(
            ...planFor(source, preset.id).findings,
            ...(outcomes[renderKey(source, preset.id)] ?? []),
          );
        }
      }
    }
    const any = Object.values(sources).some((list) => list.length > 0);
    if (any) {
      findings.push(
        ...groupCountFindings(sources, presetIds),
        ...packagePlan(sources, presetIds).findings,
      );
    }
    return findings;
  }, [sources, presetIds, outcomes]);

  return { images, listing, rejected: notices.length };
}

/**
 * The worst severity across images (planning and verified renders), the package (counts and
 * layout) and the listing (spec §9.3 status bar). Rejected files count as warnings.
 */
export function useWorkspaceStatus(debounceMs = LISTING_DEBOUNCE_MS): WorkspaceStatus {
  const { images, listing, rejected } = useWorkspaceFindings(debounceMs);
  const all = [...images, ...listing];
  if (all.length === 0 && rejected === 0) return { worst: 'idle', warnings: 0, failures: 0 };
  const failures = count(all, 'failure');
  const warnings = count(all, 'warning') + rejected;
  const worst = failures > 0 ? 'failure' : warnings > 0 ? 'warning' : worstOf(all);
  return { worst, warnings, failures };
}
