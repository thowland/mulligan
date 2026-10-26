import { useMemo, useState } from 'react';
import { groupCountFindings, packagePlan } from '../../core-bridge/package.ts';
import { useRenderCache } from '../../render/cache.ts';
import { useSession } from '../../state/session.ts';
import { FindingList } from '../../ui/FindingList.tsx';
import { saveBlob } from '../../ui/files.ts';
import { formatBytes } from '../format.ts';
import { buildPackage } from './build.ts';
import styles from './PackagePanel.module.css';

type BuildState =
  | { status: 'idle' }
  | { status: 'building'; done: number; total: number }
  | { status: 'done'; fileName: string; size: number }
  | { status: 'error'; message: string };

/** The Package tab: what the ZIP will contain, its findings, and the download (spec §9.3). */
export function PackagePanel() {
  const cache = useRenderCache();
  const sources = useSession((s) => s.sources);
  const presetIds = useSession((s) => s.selectedPresetIds);
  const [build, setBuild] = useState<BuildState>({ status: 'idle' });

  const plan = useMemo(() => packagePlan(sources, presetIds), [sources, presetIds]);
  const findings = useMemo(
    () => [...groupCountFindings(sources, presetIds), ...plan.findings],
    [sources, presetIds, plan],
  );
  const images = plan.entries.filter((e) => e.kind === 'image');
  const folders = new Map<string, number>();
  for (const entry of images) {
    const folder = entry.path.slice(0, entry.path.indexOf('/'));
    folders.set(folder, (folders.get(folder) ?? 0) + 1);
  }

  if (images.length === 0) {
    return (
      <div className={styles.empty}>
        <h2>Nothing to package yet</h2>
        <p>
          Add images on the Images tab and select output sizes. This tab then summarizes every
          output and finding and produces a single ZIP for upload to the stores.
        </p>
      </div>
    );
  }

  const download = async () => {
    setBuild({ status: 'building', done: 0, total: images.length });
    try {
      const built = await buildPackage({
        sources,
        presetIds,
        cache,
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
        <table className={styles.table}>
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
            <tr>
              <th scope="row">
                <code>manifest.json</code>
              </th>
              <td>1</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="package-findings" className={styles.section}>
        <h2 id="package-findings">Checks</h2>
        <FindingList findings={findings} />
        <p className={styles.note}>
          Each image's own checks are shown on its preview card and recorded in the manifest.
        </p>
      </section>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.download}
          disabled={build.status === 'building'}
          onClick={() => void download()}
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
