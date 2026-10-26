// Adapter between the UI and @mulligan/core standards. The app holds no rules of its own:
// everything shown here is read from the library (spec §2, §9.2).
import {
  LIBRARY_VERSION,
  RULES,
  getStandards,
  getStandardsInfo,
  type FieldDef,
  type GroupDef,
  type PresetDef,
  type RuleInfo,
  type Standards,
  type StoreDef,
} from '@mulligan/core';

export interface PresetsByStore {
  store: StoreDef;
  presets: PresetDef[];
}

export interface PresetGroupView {
  group: GroupDef;
  stores: PresetsByStore[];
}

export interface FieldsByStore {
  store: StoreDef;
  fields: FieldDef[];
}

export interface VersionInfo {
  libraryVersion: string;
  rulesetVersion: string;
  standardsHash: string;
}

/** Presets grouped by asset group, then store, in configuration order. */
export function presetGroups(): PresetGroupView[] {
  const { groups, stores, presets } = getStandards();
  return groups
    .map((group) => ({
      group,
      stores: stores
        .map((store) => ({
          store,
          presets: presets.filter((p) => p.group === group.id && p.store === store.id),
        }))
        .filter((entry) => entry.presets.length > 0),
    }))
    .filter((view) => view.stores.length > 0);
}

/** Listing fields grouped by store, in configuration order. */
export function fieldsByStore(): FieldsByStore[] {
  const { stores, fields } = getStandards();
  return stores
    .map((store) => ({ store, fields: fields.filter((f) => f.store === store.id) }))
    .filter((entry) => entry.fields.length > 0);
}

export function versionInfo(): VersionInfo {
  return { libraryVersion: LIBRARY_VERSION, ...getStandardsInfo() };
}

/** The standards' input thresholds and text rules, for the help page. */
export function standardsRules(): Pick<Standards, 'input' | 'rules'> {
  const { input, rules } = getStandards();
  return { input, rules };
}

/** Every rule in the catalog, in catalog order. */
export function ruleCatalog(): RuleInfo[] {
  return Object.values(RULES);
}
