import type { Finding, ImportFileResult, TextEncodingName } from '@mulligan/core';
import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  MAX_IMPORT_BYTES,
  fieldLabel,
  hasListingInput,
  importListingFile,
} from '../../core-bridge/listing.ts';
import { useListingStore } from '../../state/listing.ts';
import { FindingList } from '../../ui/FindingList.tsx';
import { formatBytes } from '../format.ts';
import styles from './ListingImport.module.css';

const ENCODING_LABEL: Record<TextEncodingName, string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16 (little-endian)',
  'utf-16be': 'UTF-16 (big-endian)',
  'windows-1252': 'Windows-1252',
};

const TEMPLATES = `${import.meta.env.BASE_URL}templates/`;

type ImportState =
  | { status: 'idle' }
  | { status: 'confirm'; fileName: string; result: ImportFileResult; overwrites: string[] }
  | { status: 'done'; fileName: string; result: ImportFileResult; imported: number }
  | { status: 'failed'; fileName: string; findings: Finding[]; encoding: TextEncodingName | null };

/** Import of the CSV or JSON listing template (spec §6.9), by file picker or drop. */
export function ListingImport() {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ status: 'idle' });
  const [dragging, setDragging] = useState(false);
  const inputs = useListingStore((s) => s.inputs);
  const importFields = useListingStore((s) => s.importFields);

  const apply = (fileName: string, result: ImportFileResult) => {
    importFields(result.fields);
    setState({ status: 'done', fileName, result, imported: Object.keys(result.fields).length });
  };

  const read = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      setState({
        status: 'failed',
        fileName: file.name,
        encoding: null,
        findings: [
          {
            ruleId: 'import.too-large',
            severity: 'failure',
            subject: { kind: 'listing' },
            message: `The file is ${formatBytes(file.size)}, over the ${formatBytes(MAX_IMPORT_BYTES)} import limit.`,
          },
        ],
      });
      return;
    }
    const result = importListingFile(new Uint8Array(await file.arrayBuffer()), file.name);
    if (!result.ok) {
      setState({
        status: 'failed',
        fileName: file.name,
        findings: result.findings,
        encoding: result.encoding,
      });
      return;
    }
    const overwrites = Object.keys(result.fields).filter((fieldId) => {
      const current = inputs[fieldId];
      return current !== undefined && hasListingInput({ [fieldId]: current });
    });
    if (overwrites.length > 0) {
      setState({ status: 'confirm', fileName: file.name, result, overwrites });
      return;
    }
    apply(file.name, result);
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void read(file);
  };

  const isFileDrag = (event: DragEvent) => event.dataTransfer.types.includes('Files');
  const onDragOver = (event: DragEvent) => {
    // Claim file drags only; the document drop guard refuses links and HTML (spec §10.2).
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  };
  const onDrop = (event: DragEvent) => {
    setDragging(false);
    if (!isFileDrag(event)) return;
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void read(file);
  };

  return (
    <section
      className={styles.import}
      aria-labelledby={`${id}-title`}
      data-dragging={dragging || undefined}
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className={styles.row}>
        <h2 id={`${id}-title`} className={styles.title}>
          Import from a template
        </h2>
        <button type="button" className={styles.button} onClick={() => inputRef.current?.click()}>
          Choose CSV or JSON file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className={styles.file}
          aria-label="Listing template file"
          data-testid="listing-import-input"
          onChange={onPick}
        />
        <span className={styles.hint}>
          or drop it here. Blank templates for agencies:{' '}
          <a href={`${TEMPLATES}mulligan-listing-template.csv`} download>
            CSV
          </a>{' '}
          ·{' '}
          <a href={`${TEMPLATES}mulligan-listing-template.json`} download>
            JSON
          </a>
        </span>
      </div>

      {state.status === 'confirm' && (
        <div className={styles.confirm} role="group" aria-label="Replace existing copy">
          <p>
            {state.fileName} replaces copy already entered in {state.overwrites.length}{' '}
            {state.overwrites.length === 1 ? 'field' : 'fields'}:{' '}
            {state.overwrites.map(fieldLabel).join(', ')}.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              onClick={() => apply(state.fileName, state.result)}
            >
              Replace
            </button>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => setState({ status: 'idle' })}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {state.status === 'done' && (
        <div className={styles.outcome} role="status">
          <p>
            Imported {state.imported} {state.imported === 1 ? 'field' : 'fields'} from{' '}
            {state.fileName}
            {state.result.encoding ? ` (${ENCODING_LABEL[state.result.encoding]})` : ''}.
          </p>
          <FindingList findings={state.result.findings} />
        </div>
      )}

      {state.status === 'failed' && (
        <div className={styles.outcome} role="status">
          <p>
            {state.fileName} could not be imported
            {state.encoding ? ` (read as ${ENCODING_LABEL[state.encoding]})` : ''}.
          </p>
          <FindingList findings={state.findings} />
        </div>
      )}
    </section>
  );
}
