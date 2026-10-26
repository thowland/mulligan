import type { Finding } from '../findings/types.ts';
import type { ImagePlan, RenderedImage } from './engine.ts';
import { checkFinding, fileSubject, type FileRef } from './findings.ts';
import { inspectImage, isImageInspectError, type ImageInspectError } from './inspect.ts';

const MIME = { png: 'image/png', jpeg: 'image/jpeg' } as const;

/** Findings for a file that could not be inspected (unsupported type or corrupt header). */
export function inspectionFindings(error: ImageInspectError, ref: FileRef): Finding[] {
  const ruleId =
    error.error === 'unsupported-type' ? 'image.unsupported-type' : 'image.decode-failed';
  return [checkFinding(ruleId, fileSubject(ref), false, error.message)];
}

/** Finding for a file the renderer could not decode. */
export function decodeFailedFinding(ref: FileRef, message: string): Finding {
  return checkFinding('image.decode-failed', fileSubject(ref), false, message);
}

/**
 * Verifies an encoded full-size output against its plan by re-reading the bytes, so a renderer
 * cannot report compliance it did not achieve (spec §7.4).
 */
export function checkRendered(plan: ImagePlan, out: RenderedImage): Finding[] {
  const subject = fileSubject(plan, plan.presetId);
  const info = inspectImage(out.bytes);
  const expectedType = MIME[plan.format];

  if (isImageInspectError(info)) {
    return [
      checkFinding(
        'image.output.format',
        subject,
        false,
        `Output is not a readable image: ${info.message}`,
      ),
    ];
  }

  const findings: Finding[] = [];
  const formatOk = info.type === expectedType && out.mimeType === expectedType;
  findings.push(
    checkFinding(
      'image.output.format',
      subject,
      formatOk,
      formatOk
        ? `Output is ${plan.format.toUpperCase()}.`
        : `Output is ${info.type}, expected ${expectedType}.`,
    ),
  );

  const dimensionsOk = info.width === plan.target.width && info.height === plan.target.height;
  findings.push(
    checkFinding(
      'image.output.dimensions',
      subject,
      dimensionsOk,
      dimensionsOk
        ? `Output is ${info.width} × ${info.height}.`
        : `Output is ${info.width} × ${info.height}, expected ${plan.target.width} × ${plan.target.height}.`,
      { width: info.width, height: info.height },
    ),
  );

  const alphaOk = plan.alpha || !info.hasAlphaChannel;
  let alphaMessage = 'Output has an alpha channel, which this preset does not permit.';
  if (plan.alpha) alphaMessage = 'Alpha channel permitted.';
  else if (alphaOk) alphaMessage = 'Output has no alpha channel.';
  findings.push(checkFinding('image.output.alpha', subject, alphaOk, alphaMessage));

  if (plan.maxBytes !== undefined) {
    const size = out.bytes.length;
    const sizeOk = size <= plan.maxBytes;
    findings.push(
      checkFinding(
        'image.output.size',
        subject,
        sizeOk,
        sizeOk
          ? `Output is ${size} bytes, within the ${plan.maxBytes}-byte limit.`
          : `Output is ${size} bytes, over the ${plan.maxBytes}-byte limit.`,
        { bytes: size, limit: plan.maxBytes },
      ),
    );
  }

  if (!plan.alpha) {
    const flattened = out.measured.hadTransparentPixels;
    findings.push(
      checkFinding(
        'image.transparency-flattened',
        subject,
        !flattened,
        flattened
          ? `Transparent areas were filled with ${plan.flatten ?? 'the background colour'}.`
          : 'Source had no transparent pixels.',
      ),
    );
  }

  return findings;
}
