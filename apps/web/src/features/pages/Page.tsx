import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Page.module.css';

interface PageProps {
  title: string;
  onDone: () => void;
  children: ReactNode;
}

/** A full page shown in place of the workspace (Help, About), with a way back. */
export function Page({ title, onDone, children }: PageProps) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  // Move focus to the page so keyboard and screen-reader users land at its start.
  useEffect(() => heading.current?.focus(), []);

  return (
    <article className={styles.page} aria-labelledby={headingId}>
      <div className={styles.top}>
        <h2 id={headingId} ref={heading} tabIndex={-1} className={styles.title}>
          {title}
        </h2>
        <button type="button" className={styles.done} onClick={onDone}>
          Back to workspace
        </button>
      </div>
      {children}
    </article>
  );
}

interface SectionProps {
  id: string;
  title: string;
  children: ReactNode;
}

export function Section({ id, title, children }: SectionProps) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h3 id={id} className={styles.sectionTitle}>
        {title}
      </h3>
      {children}
    </section>
  );
}
