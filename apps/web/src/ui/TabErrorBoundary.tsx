import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useSessionStore } from '../state/session.ts';
import styles from './TabErrorBoundary.module.css';

interface TabErrorBoundaryProps {
  label: string;
  children: ReactNode;
  /** Reloads the page; replaceable in tests. */
  reload?: () => void;
}

interface TabErrorBoundaryState {
  error: Error | null;
}

const reloadPage = () => globalThis.location.reload();

/** Contains a failure to one tab and offers a reload (spec §11); the session survives it. */
export class TabErrorBoundary extends Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  override state: TabErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`The ${this.props.label} tab failed`, error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return <TabFailure label={this.props.label} reload={this.props.reload ?? reloadPage} />;
  }
}

function TabFailure({ label, reload }: { label: string; reload: () => void }) {
  const saved = useSessionStore((s) => s.mode) === 'saved';
  return (
    <div className={styles.failure} role="alert">
      <h2>The {label} tab stopped working</h2>
      <p>
        Something unexpected went wrong.{' '}
        {saved
          ? 'Your session is saved in this browser, so reloading brings it back.'
          : 'Your work is not saved on this device, so reloading loses it.'}
      </p>
      <button type="button" className={styles.reload} onClick={reload}>
        {saved ? 'Reload (your session is saved)' : 'Reload (unsaved work will be lost)'}
      </button>
    </div>
  );
}
