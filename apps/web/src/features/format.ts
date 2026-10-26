// Presentation helpers: turn standards values into display text. No rules live here.
import type { Anchor, FieldDef, PresetDef } from '@mulligan/core';

export function formatDimensions(width: number, height: number): string {
  return `${width} × ${height}`;
}

export function formatBytes(bytes: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${rounded} ${units[unit]}`;
}

export function formatOutput(preset: Pick<PresetDef, 'format' | 'alpha'>): string {
  const format = preset.format.toUpperCase();
  return preset.alpha ? `${format} · alpha allowed` : `${format} · no alpha`;
}

export function formatAnchor(anchor: Anchor): string {
  if (anchor === 'top') return 'Top-anchored crop';
  if (anchor === 'center') return 'Centered crop';
  return `Crop anchored ${anchor.y}-${anchor.x}`;
}

export function formatLimit(limit: FieldDef['limit']): string {
  const unit = limit.unit === 'bytes' ? 'bytes' : 'characters';
  const range = limit.min === undefined ? String(limit.max) : `${limit.min}–${limit.max}`;
  return `${range} ${unit}`;
}
