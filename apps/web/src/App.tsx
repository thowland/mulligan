import { useState } from 'react';
import { versionInfo } from './core-bridge/standards.ts';
import { ImagesPanel } from './features/images/ImagesPanel.tsx';
import { FieldCatalog } from './features/listing/FieldCatalog.tsx';
import { PackagePanel } from './features/package/PackagePanel.tsx';
import { StatusBar } from './ui/StatusBar.tsx';
import { Tabs, type TabDef } from './ui/Tabs.tsx';
import styles from './App.module.css';

const TABS: TabDef[] = [
  { id: 'images', label: 'Images', content: <ImagesPanel /> },
  { id: 'listing', label: 'Listing', content: <FieldCatalog /> },
  { id: 'package', label: 'Package', content: <PackagePanel /> },
];

export function App() {
  const [tab, setTab] = useState('images');
  const versions = versionInfo();

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.wordmark}>Mulligan</h1>
        <p className={styles.tagline}>Store-ready artwork and listing copy, in your browser.</p>
      </header>
      <main className={styles.main}>
        <Tabs tabs={TABS} selected={tab} onSelect={setTab} label="Workspace" />
      </main>
      <StatusBar versions={versions} />
    </div>
  );
}
