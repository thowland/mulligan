import { describe, expect, it } from 'vitest';
import { checkFinding, fileSubject } from '../src/image/findings.ts';

describe('image finding helpers', () => {
  const ref = { groupId: 'icon', sourceId: 's', fileName: 'logo.png' };

  it('adds the preset to a file subject only when given', () => {
    expect(fileSubject(ref)).toEqual({ kind: 'file', ...ref });
    expect(fileSubject(ref, 'apple-icon')).toEqual({
      kind: 'file',
      ...ref,
      presetId: 'apple-icon',
    });
  });

  it('uses pass or the catalog severity, and omits empty data', () => {
    const subject = fileSubject(ref);
    expect(checkFinding('image.upscaled', subject, true, 'ok')).toEqual({
      ruleId: 'image.upscaled',
      severity: 'pass',
      subject,
      message: 'ok',
    });
    expect(checkFinding('image.output.size', subject, false, 'big', { bytes: 2 }).severity).toBe(
      'failure',
    );
  });

  it('rejects unknown rules and change rules', () => {
    expect(() => checkFinding('image.nope', fileSubject(ref), true, 'x')).toThrow(
      /Unknown check rule/,
    );
    expect(() => checkFinding('lines.rejoin', fileSubject(ref), true, 'x')).toThrow(
      /Unknown check rule/,
    );
  });
});
