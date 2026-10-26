import { useMemo, useState } from 'react';
import { exportListing, hasListingInput, listingFindings } from '../../core-bridge/listing.ts';
import { packagePlan, subjectLabel } from '../../core-bridge/package.ts';
import { useRenderCache } from '../../render/cache.ts';
import { useImageStore } from '../../state/images.ts';
import { useListingStore } from '../../state/listing.ts';
import { Confirm } from '../../ui/Confirm.tsx';
import { StatusBadge } from '../../ui/StatusBadge.tsx';
import { saveBlob } from '../../ui/files.ts';
import { formatBytes } from '../format.ts';
import { useWorkspaceFindings } from '../status/useWorkspaceStatus.ts';
import { buildPackage } from './build.ts';
import { FindingsTable } from './FindingsTable.tsx';
import styles from './PackagePanel.module.css';

/** Failures listed in the download confirmation before "and N more". */
const LISTED_FAILURES = 8;

type BuildState =
  | { status: 'idle' }
  | { status: 'building'; done: number; total: number }
  | { status: 'done'; fileName: string; size: number }
  | { status: 'error'; message: string };

/** The Package tab: what the ZIP will contain, its findings, and the download (spec §9.3). */
export function PackagePanel() {
  const cache = useRenderCache();
  const sources = useImageStore((s) => s.sources);
  const presetIds = useImageStore((s) => s.selectedPresetIds);
  const [build, setBuild] = useState<BuildState>({ status: 'idle' });
  const inputs = useListingStore((s) => s.inputs);
  const straightQuotes = useListingStore((s) => s.straightQuotes);
  const reverted = useListingStore((s) => s.reverted);
  const hasListing = hasListingInput(inputs);
  const draft = useMemo(
    () => ({ inputs, straightQuotes, reverted }),
    [inputs, straightQuotes, reverted],
  );
  const listing = useMemo(() => (hasListing ? listingFindings(draft) : []), [hasListing, draft]);
  const listingFailures = listing.filter((f) => f.severity === 'failure').length;
  const listingWarnings = listing.filter((f) => f.severity === 'warning').length;

  const plan = useMemo(
    () => packagePlan(sources, presetIds, hasListing),
    [sources, presetIds, hasListing],
  );
  const workspace = useWorkspaceFindings();
  // The listing's own findings are not debounced here, so a confirmation never lags an edit.
  const findings = useMemo(() => [...workspace.images, ...listing], [workspace.images, listing]);
  const failures = findings.filter((f) => f.severity === 'failure');
  const [confirming, setConfirming] = useState(false);
  const images = plan.entries.filter((e) => e.kind === 'image');
  const folders = new Map<string, number>();
  for (const entry of images) {
    const folder = entry.path.slice(0, entry.path.indexOf('/'));
    folders.set(folder, (folders.get(folder) ?? 0) + 1);
  }

  if (images.length === 0 && !hasListing) {
    return (
      <div className={styles.empty}>
        <h2>Nothing to package yet</h2>
        <p>
          Add images on the Images tab and listing copy on the Listing tab. This tab then summarizes
          every output and finding and produces a single ZIP for upload to the stores.
        </p>
      </div>
    );
  }

  const download = async () => {
    setConfirming(false);
    setBuild({ status: 'building', done: 0, total: images.length });
    try {
      const built = await buildPackage({
        sources,
        presetIds,
        cache,
        listing: hasListing ? exportListing(draft, new Date()) : undefined,
        onProgress: (done, total) => setBuild({ status: 'building', done, total }),
      });
      saveBlob(built.blob, built.fileName);
      setBuild({ status: 'done', fileName: built.fileName, size: built.blob.size });
    } catch (error) {
      setBuild({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className={styles.panel}>
      <section aria-labelledby="package-contents" className={styles.section}>
        <h2 id="package-contents">Contents</h2>
        <table className={styles.table} aria-labelledby="package-contents">
          <thead>
            <tr>
              <th scope="col">Folder</th>
              <th scope="col">Files</th>
            </tr>
          </thead>
          <tbody>
            {[...folders].map(([folder, count]) => (
              <tr key={folder}>
                <th scope="row">
                  <code>{folder}/</code>
                </th>
                <td>{count}</td>
              </tr>
            ))}
            {hasListing && (
              <tr>
                <th scope="row">
                  <code>listing/</code>
                </th>
                <td>2</td>
              </tr>
            )}
            <tr>
              <th scope="row">
                <code>manifest.json</code>
              </th>
              <td>1</td>
            </tr>
          </tbody>
        </table>
      </section>

      {hasListing && (
        <section aria-labelledby="package-listing" className={styles.section}>
          <h2 id="package-listing">Listing</h2>
          <p className={styles.listingStatus}>
            <StatusBadge
              status={listingFailures > 0 ? 'failure' : listingWarnings > 0 ? 'warning' : 'pass'}
            />
            <span>
              {listingFailures === 0 && listingWarnings === 0
                ? 'Every field passes its checks.'
                : [
                    listingFailures > 0 &&
                      `${listingFailures} ${listingFailures === 1 ? 'failure' : 'failures'}`,
                    listingWarnings > 0 &&
                      `${listingWarnings} ${listingWarnings === 1 ? 'warning' : 'warnings'}`,
                  ]
                    .filter(Boolean)
                    .join(' and ') + ' in the listing; see the Listing tab for details.'}
            </span>
          </p>
          <p className={styles.note}>
            The cleaned copy is saved as <code>listing/listing.txt</code> and{' '}
            <code>listing/listing.json</code>.
          </p>
        </section>
      )}

      <section aria-labelledby="package-findings" className={styles.section}>
        <h2 id="package-findings">Checks</h2>
        <FindingsTable findings={findings} />
        <p className={styles.note}>
          Every finding is also recorded in the package’s <code>manifest.json</code>.
        </p>
      </section>

      {confirming && (
        <Confirm
          title={`Download a package with ${failures.length} ${failures.length === 1 ? 'failure' : 'failures'}?`}
          confirmLabel="Download anyway"
          tone="failure"
          onConfirm={() => void download()}
          onCancel={() => setConfirming(false)}
        >
          <p>The stores may reject these. The manifest records every failure.</p>
          <ul>
            {failures.slice(0, LISTED_FAILURES).map((f, index) => (
              <li key={`${index}-${f.ruleId}`}>
                <strong>{subjectLabel(f)}</strong>: {f.message}
              </li>
            ))}
            {failures.length > LISTED_FAILURES && (
              <li>and {failures.length - LISTED_FAILURES} more (see Checks).</li>
            )}
          </ul>
        </Confirm>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.download}
          disabled={build.status === 'building' || confirming}
          onClick={() => (failures.length > 0 ? setConfirming(true) : void download())}
        >
          Download package
        </button>
        <span className={styles.progress} role="status">
          {build.status === 'building' &&
            `Preparing ${build.done} of ${build.total} ${build.total === 1 ? 'file' : 'files'}…`}
          {build.status === 'done' && `Saved ${build.fileName} (${formatBytes(build.size)}).`}
          {build.status === 'error' && `The package could not be built: ${build.message}`}
        </span>
      </div>
    </div>
  );
}
