import { useState, type ReactNode } from 'react';
import { versionInfo } from './core-bridge/standards.ts';
import { ImagesPanel } from './features/images/ImagesPanel.tsx';
import { ListingPanel } from './features/listing/ListingPanel.tsx';
import { PackagePanel } from './features/package/PackagePanel.tsx';
import { ClearSession } from './features/session/ClearSession.tsx';
import { SessionNotices } from './features/session/SessionNotices.tsx';
import { useWorkspaceStatus } from './features/status/useWorkspaceStatus.ts';
import { StatusBar } from './ui/StatusBar.tsx';
import { TabErrorBoundary } from './ui/TabErrorBoundary.tsx';
import { Tabs, type TabDef } from './ui/Tabs.tsx';
import styles from './App.module.css';

const tab = (id: string, label: string, content: ReactNode): TabDef => ({
  id,
  label,
  content: <TabErrorBoundary label={label}>{content}</TabErrorBoundary>,
});

const TABS: TabDef[] = [
  tab('images', 'Images', <ImagesPanel />),
  tab('listing', 'Listing', <ListingPanel />),
  tab('package', 'Package', <PackagePanel />),
];

export function App() {
  const [selected, setSelected] = useState('images');
  const versions = versionInfo();
  const status = useWorkspaceStatus();

  return (
    <div className={styles.app}>
      <div>
        <header className={styles.header}>
          <h1 className={styles.wordmark}>Mulligan</h1>
          <p className={styles.tagline}>Store-ready artwork and listing copy, in your browser.</p>
          <ClearSession />
        </header>
        <SessionNotices />
      </div>
      <main className={styles.main}>
        <Tabs tabs={TABS} selected={selected} onSelect={setSelected} label="Workspace" />
      </main>
      <StatusBar versions={versions} status={status} />
    </div>
  );
}
