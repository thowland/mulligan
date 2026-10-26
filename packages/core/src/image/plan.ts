import type { Anchor, PresetDef, Standards } from '../standards/schema.ts';
import type { CropRect, ImagePlan } from './engine.ts';
import { checkFinding, fileSubject, type FileRef } from './findings.ts';

export type AxisAnchorX = 'left' | 'center' | 'right';
export type AxisAnchorY = 'top' | 'center' | 'bottom';

/** A source to plan for, with oriented (as-displayed) dimensions. */
export interface PlanSource {
  sourceId: string;
  fileName: string;
  width: number;
  height: number;
}

export function resolveAnchor(anchor: Anchor): { x: AxisAnchorX; y: AxisAnchorY } {
  if (anchor === 'top') return { x: 'center', y: 'top' };
  if (anchor === 'center') return { x: 'center', y: 'center' };
  return anchor;
}

type Position = 'start' | 'center' | 'end';

const toPosition = (axis: AxisAnchorX | AxisAnchorY): Position =>
  axis === 'left' || axis === 'top' ? 'start' : axis === 'center' ? 'center' : 'end';

function offset(free: number, position: Position): number {
  if (position === 'start') return 0;
  if (position === 'end') return free;
  return Math.floor(free / 2);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Largest rectangle of the target aspect ratio inside the source, placed by the anchor
 * (spec §7.2). Integer pixels; any sub-pixel aspect error is absorbed by the final resize.
 */
export function computeCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  anchor: Anchor,
): CropRect {
  const { x, y } = resolveAnchor(anchor);
  // Compare aspect ratios with integer cross-multiplication to avoid floating-point ties.
  if (sourceWidth * targetHeight > sourceHeight * targetWidth) {
    const width = clamp(Math.round((sourceHeight * targetWidth) / targetHeight), 1, sourceWidth);
    return { x: offset(sourceWidth - width, toPosition(x)), y: 0, width, height: sourceHeight };
  }
  const height = clamp(Math.round((sourceWidth * targetHeight) / targetWidth), 1, sourceHeight);
  return { x: 0, y: offset(sourceHeight - height, toPosition(y)), width: sourceWidth, height };
}

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** Decide crop, scale, format and alpha handling for one source and preset. */
export function planImage(source: PlanSource, preset: PresetDef, s: Standards): ImagePlan {
  const group = s.groups.find((g) => g.id === preset.group);
  if (!group) throw new Error(`Preset "${preset.id}" refers to unknown group "${preset.group}"`);

  const anchor = preset.anchor ?? group.anchor;
  const crop = computeCrop(source.width, source.height, preset.width, preset.height, anchor);
  const ref: FileRef = { groupId: group.id, sourceId: source.sourceId, fileName: source.fileName };
  const subject = fileSubject(ref, preset.id);

  const factor = Math.max(preset.width / crop.width, preset.height / crop.height);
  const upscaled = factor > s.input.upscaleWarnAbove;
  const factorText = `${factor.toFixed(2)}×`;

  // An axis anchored to an edge is "protected": discarding its far end is intended (for
  // example the bottom of a long top-anchored capture). Loss on a centred axis suggests an
  // orientation or aspect mismatch.
  const axes = resolveAnchor(anchor);
  const widthLoss = axes.x === 'center' ? 1 - crop.width / source.width : 0;
  const heightLoss = axes.y === 'center' ? 1 - crop.height / source.height : 0;
  const loss = Math.max(widthLoss, heightLoss);
  const lossAxis = widthLoss >= heightLoss ? 'width' : 'height';
  const cropLoss = loss > s.input.cropLossWarnAbove;

  const findings = [
    checkFinding(
      'image.upscaled',
      subject,
      !upscaled,
      upscaled
        ? `Upscaled ${factorText} from a ${crop.width} × ${crop.height} crop; the result may be soft.`
        : `No upscaling needed (scale ${factorText}).`,
      { factor: Math.round(factor * 100) / 100 },
    ),
    checkFinding(
      'image.crop-loss',
      subject,
      !cropLoss,
      cropLoss
        ? `Cropping removes ${percent(loss)} of the image's ${lossAxis}. Check that the source suits this preset.`
        : 'Crop keeps the important part of the image.',
      { loss: Math.round(loss * 1000) / 1000, axis: lossAxis },
    ),
  ];

  const plan: ImagePlan = {
    presetId: preset.id,
    groupId: group.id,
    sourceId: source.sourceId,
    fileName: source.fileName,
    source: { width: source.width, height: source.height },
    crop,
    target: { width: preset.width, height: preset.height },
    scale: preset.width / crop.width,
    format: preset.format,
    alpha: preset.alpha,
    findings,
  };
  if (preset.jpegQuality !== undefined) plan.jpegQuality = preset.jpegQuality;
  if (!preset.alpha) plan.flatten = preset.flatten;
  if (preset.maxBytes !== undefined) plan.maxBytes = preset.maxBytes;
  return plan;
}
