import { APP_INFO } from '../../config.ts';
import { versionInfo } from '../../core-bridge/standards.ts';
import { Page, Section } from './Page.tsx';
import styles from './Page.module.css';

/** Where the GPL's corresponding source lives. */
export const SOURCE_URL = 'https://github.com/thowland/mulligan';
export const CONTACT_EMAIL = 'th@wdogsystems.com';
/** The official site; a copy served anywhere else is not the published build (spec §10.6). */
export const CANONICAL_URL = 'https://mulligan.beta-site.us';
const LICENSE_URL = 'https://www.gnu.org/licenses/gpl-3.0.html';

/** About: what Mulligan is, where its source is, who made it, and the versions in force. */
export function AboutPage({ onDone }: { onDone: () => void }) {
  const versions = versionInfo();

  return (
    <Page title="About Mulligan" onDone={onDone}>
      <p className={styles.lede}>
        Library {versions.libraryVersion} · Ruleset {versions.rulesetVersion}
      </p>

      <Section id="about-what" title="What Mulligan does">
        <p>
          App store listings are usually assembled from material an agency delivers, and that
          material rarely arrives in the shape the stores accept: screenshots captured at the wrong
          size, artwork with transparency where none is allowed, and copy pasted out of Word with
          invisible characters, emoji and hard line breaks that count against the limit or get the
          listing rejected. Mulligan fixes those problems mechanically. It crops and resizes images
          to the Apple App Store and Google Play presets, cleans the characters and spacing of the
          listing copy without changing its wording, checks both against the store rules, and
          packages the result with a record of every change.
        </p>
        <p>
          It runs entirely in your browser. The site’s security policy forbids the page from making
          network requests, so the files and copy you work on stay on your device, and there are no
          accounts, analytics or advertising.
        </p>
      </Section>

      <Section id="about-name" title="The name">
        <p>
          In golf, a mulligan is a second attempt at a shot that went wrong, taken without penalty.
          Mulligan gives an agency’s delivery the same second attempt, without another round trip to
          the agency for corrected files.
        </p>
      </Section>

      <Section id="about-author" title="Author and contact">
        <p>
          Mulligan was written by Tim Howland. Questions, problems and suggestions are welcome at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>, or as issues on GitHub.
        </p>
      </Section>

      <Section id="about-license" title="Source code and license">
        <p>Copyright © 2026 Tim Howland.</p>
        <p>
          Mulligan is free software: you can redistribute it and change it under the terms of the{' '}
          <a href={LICENSE_URL} target="_blank" rel="noreferrer">
            GNU General Public License
          </a>
          , version 3 or later. It comes with no warranty. The source code, including the rules file
          and the library that applies it, is on{' '}
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          .
        </p>
      </Section>

      <Section id="about-versions" title="Versions">
        <p>
          The library is the code that applies the rules, and the ruleset is the rules file it
          applies, covering the store sizes, field limits and cleanup rules. Each package records
          both, with the fingerprint of the rules file and the build, so a package can be traced to
          the exact rules and code that produced it. The published build is served only from{' '}
          <a href={CANONICAL_URL}>{CANONICAL_URL.replace('https://', '')}</a>; a copy served from
          anywhere else may have been changed.
        </p>
        <dl className={styles.rules}>
          <div>
            <dt>Library version</dt>
            <dd>{versions.libraryVersion}</dd>
          </div>
          <div>
            <dt>Ruleset version</dt>
            <dd>{versions.rulesetVersion}</dd>
          </div>
          <div>
            <dt>Build</dt>
            <dd>
              <code>{APP_INFO.build}</code>
            </dd>
          </div>
          <div>
            <dt>Rules fingerprint</dt>
            <dd>
              <code>{versions.standardsHash}</code>
            </dd>
          </div>
        </dl>
      </Section>
    </Page>
  );
}
