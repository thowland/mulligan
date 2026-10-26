// Turns dropped or chosen files into session sources, in the order received. Every decision comes
// from core: size before reading, type and header before decoding, pixel count before decoding.
import { inspectSource } from '../../core-bridge/images.ts';
import { fileSizeFinding, pixelFinding } from '../../core-bridge/package.ts';
import { noticeId, type Notice, type SourceEntry } from '../../state/session.ts';
import { readFileBytes } from '../../ui/files.ts';

export interface IntakeResult {
  accepted: SourceEntry[];
  rejected: Notice[];
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice()));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

const newId = () => crypto.randomUUID();

export async function intakeFiles(groupId: string, files: readonly File[]): Promise<IntakeResult> {
  const accepted: SourceEntry[] = [];
  const rejected: Notice[] = [];
  const reject = (fileName: string, message: string) =>
    rejected.push({ id: noticeId(), groupId, fileName, messages: [message] });

  for (const file of files) {
    const id = newId();
    const ref = { groupId, sourceId: id, fileName: file.name };

    const size = fileSizeFinding(file.size, ref);
    if (size.severity !== 'pass') {
      reject(file.name, size.message);
      continue;
    }

    const bytes = await readFileBytes(file);
    const outcome = inspectSource(id, file.name, groupId, bytes);
    if (!outcome.ok) {
      reject(file.name, outcome.findings.map((f) => f.message).join(' '));
      continue;
    }

    const { info } = outcome.source;
    const pixels = pixelFinding(
      { byteLength: bytes.length, width: info.orientedWidth, height: info.orientedHeight },
      ref,
    );
    if (pixels.severity !== 'pass') {
      reject(file.name, pixels.message);
      continue;
    }

    accepted.push({ ...outcome.source, sha256: await sha256Hex(bytes) });
  }
  return { accepted, rejected };
}
