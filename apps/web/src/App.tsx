import { useRef, useState, type ReactNode } from 'react';
import { versionInfo } from './core-bridge/standards.ts';
import { ImagesPanel } from './features/images/ImagesPanel.tsx';
import { ListingPanel } from './features/listing/ListingPanel.tsx';
import { PackagePanel } from './features/package/PackagePanel.tsx';
import { AboutPage } from './features/pages/AboutPage.tsx';
import { HelpPage } from './features/pages/HelpPage.tsx';
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

type View = 'workspace' | 'help' | 'about';

export function App() {
  const [selected, setSelected] = useState('images');
  const [view, setView] = useState<View>('workspace');
  const opener = useRef<HTMLButtonElement | null>(null);
  const versions = versionInfo();
  const status = useWorkspaceStatus();

  const open =
    (next: Exclude<View, 'workspace'>) => (event: { currentTarget: HTMLButtonElement }) => {
      opener.current = event.currentTarget;
      setView(next);
    };
  // Back to the workspace: return focus to the link that opened the page.
  const done = () => {
    setView('workspace');
    queueMicrotask(() => opener.current?.focus());
  };
  const navButton = (target: Exclude<View, 'workspace'>, label: string) => (
    <button
      type="button"
      className={styles.navButton}
      aria-current={view === target ? 'page' : undefined}
      onClick={view === target ? done : open(target)}
    >
      {label}
    </button>
  );

  return (
    <div className={styles.app}>
      <div>
        <header className={styles.header}>
          <h1 className={styles.wordmark}>Mulligan</h1>
          <p className={styles.tagline}>Store-ready artwork and listing copy, in your browser.</p>
          <div className={styles.actions}>
            <nav aria-label="Pages" className={styles.nav}>
              {navButton('help', 'Help')}
              {navButton('about', 'About')}
            </nav>
            <ClearSession />
          </div>
        </header>
        <SessionNotices />
      </div>
      <main className={styles.main}>
        {/* The workspace stays mounted behind a page, so nothing is lost or re-rendered. */}
        <div hidden={view !== 'workspace'}>
          <Tabs tabs={TABS} selected={selected} onSelect={setSelected} label="Workspace" />
        </div>
        {view === 'help' && <HelpPage onDone={done} />}
        {view === 'about' && <AboutPage onDone={done} />}
      </main>
      <StatusBar versions={versions} status={status} />
    </div>
  );
}
