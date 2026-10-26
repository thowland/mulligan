import { fieldLabel } from '../../core-bridge/listing.ts';
import {
  fieldsByStore,
  presetGroups,
  ruleCatalog,
  standardsRules,
} from '../../core-bridge/standards.ts';
import { SESSION } from '../../config.ts';
import { formatBytes, formatDimensions, formatLimit } from '../format.ts';
import { Page, Section } from './Page.tsx';
import { ruleNote } from './ruleNotes.ts';
import styles from './Page.module.css';

const CONTENTS = [
  ['help-overview', 'Overview'],
  ['help-images', 'Image groups and presets'],
  ['help-cropping', 'Cropping and resizing'],
  ['help-fields', 'Listing fields'],
  ['help-cleanup', 'Text cleanup'],
  ['help-checks', 'Checks and severities'],
  ['help-copying', 'Copying and importing listing copy'],
  ['help-package', 'The package'],
  ['help-storage', 'Where your work is kept'],
  ['help-reset', 'Resetting your work'],
] as const;

const title = (id: (typeof CONTENTS)[number][0]) => CONTENTS.find(([key]) => key === id)![1];

const CHECK_AREAS: { prefix: string; label: string }[] = [
  { prefix: 'text.', label: 'Listing copy' },
  { prefix: 'keywords.', label: 'Keywords' },
  { prefix: 'image.', label: 'Images' },
  { prefix: 'group.', label: 'Images' },
  { prefix: 'import.', label: 'Imported templates' },
  { prefix: 'integrity.', label: 'Safeguards' },
  { prefix: 'package.', label: 'Safeguards' },
  { prefix: 'standards.', label: 'Safeguards' },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Help (spec §9.3): what the fields and rules are, and where the work is kept. */
export function HelpPage({ onDone }: { onDone: () => void }) {
  const context = standardsRules();
  const rules = ruleCatalog();
  const changes = rules.filter((rule) => rule.kind === 'change');
  const checks = rules.filter((rule) => rule.kind === 'check');
  const checkAreas = [...new Set(CHECK_AREAS.map((area) => area.label))].map((label) => ({
    label,
    rules: checks.filter((rule) =>
      CHECK_AREAS.some((area) => area.label === label && rule.id.startsWith(area.prefix)),
    ),
  }));
  const retention = plural(SESSION.retentionDays, 'day');

  return (
    <Page title="Help" onDone={onDone}>
      <p className={styles.lede}>
        How Mulligan prepares artwork and listing copy for the Apple App Store and Google Play, what
        each rule does, and where your work is kept.
      </p>
      <nav aria-label="Help contents">
        <ol className={styles.contents}>
          {CONTENTS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`}>{label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="help-overview" title={title('help-overview')}>
        <p>
          Mulligan takes the screenshots, artwork and listing copy an agency delivers and turns them
          into files the two stores will accept. The Images tab crops and resizes each image to the
          sizes the stores ask for, and the Listing tab cleans pasted copy and checks it against
          each field’s limit. The Package tab then collects the results into one ZIP file, with a
          manifest that records what was done to every file.
        </p>
        <p>
          Everything happens in this browser. Files and text are never sent anywhere: the site’s
          security policy forbids the page from making network requests at all, so there is no
          server that could receive them, and the page keeps working with the network disconnected
          once it has loaded.
        </p>
        <p>
          The status bar at the bottom of the page shows the worst result across the workspace, and
          the ruleset version in force. The rules come from a single rules file built into Mulligan;
          the tables below are generated from it, so they always match what the app does.
        </p>
      </Section>

      <Section id="help-images" title={title('help-images')}>
        <p>
          The Images tab has one drop zone for each group of assets, and a file receives only the
          presets of the group it was dropped into, so a screenshot is never turned into an icon by
          mistake. Tick the presets you need in each group; each ticked preset produces one file per
          image in that group. When the first file arrives in a group with none of its presets
          ticked, Mulligan ticks the group’s usual presets for you, and unticking them afterwards
          sticks.
        </p>
        <p>
          Screenshots are numbered in the order shown, and you can reorder them by dragging, with
          the arrow buttons, or from the keyboard. The number is the same in every preset folder, so{' '}
          <code>03</code> is the same screen in the iPhone and Android folders.
        </p>
        {presetGroups().map(({ group, stores }) => (
          <div key={group.id}>
            <h4>
              {group.label}{' '}
              <span className={styles.tag}>
                {`up to ${plural(group.maxFiles, 'file')} · ${group.anchor === 'top' ? 'top' : 'center'}-anchored crop`}
              </span>
            </h4>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Preset</th>
                    <th scope="col">Store</th>
                    <th scope="col">Size</th>
                    <th scope="col">Output</th>
                    <th scope="col">Images</th>
                    <th scope="col">Size limit</th>
                    <th scope="col">Ticked at start</th>
                    <th scope="col">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.flatMap(({ store, presets }) =>
                    presets.map((preset) => (
                      <tr key={preset.id}>
                        <th scope="row">{preset.name}</th>
                        <td>{store.label}</td>
                        <td>{formatDimensions(preset.width, preset.height)}</td>
                        <td>
                          {preset.format.toUpperCase()}
                          {preset.alpha ? ', transparency allowed' : ', no transparency'}
                        </td>
                        <td>
                          {preset.count.min === preset.count.max
                            ? preset.count.max
                            : `${preset.count.min}–${preset.count.max}`}
                        </td>
                        <td>{preset.maxBytes ? formatBytes(preset.maxBytes) : '–'}</td>
                        <td>{preset.defaultSelected ? 'Yes' : 'No'}</td>
                        <td>{preset.note ?? ''}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </Section>

      <Section id="help-cropping" title={title('help-cropping')}>
        <p>
          Each image is first cropped to the preset’s shape and then resized to its exact
          dimensions, so the stores never see an image at the wrong size. Screenshots are anchored
          at the top: a long capture of a scrolling screen keeps its top, which is where the content
          that matters usually sits, and loses the bottom. Feature graphics and icons are cropped
          from the center. Each preview card draws the crop on the source thumbnail, so you can see
          what was kept before you download.
        </p>
        <p>
          Photos that a camera saved sideways are turned upright first. Where a preset does not
          allow transparency, transparent areas are filled with white, and where the source is
          smaller than the target, it is enlarged and Mulligan warns that it will look soft. The
          previews on screen are reduced copies; the full-size files are rendered in the background,
          and their file sizes and formats are checked again before they go into the package.
        </p>
      </Section>

      <Section id="help-fields" title={title('help-fields')}>
        <p>
          The Listing tab has one editor per field. Paste or type the copy on the left, and the
          cleaned version appears on the right with a count against the field’s limit and a Copy
          button for pasting into App Store Connect or the Play Console. Characters are counted the
          cautious way, as JavaScript does, so an emoji or a rare character can count as two; the
          Apple keywords field is counted in bytes, where an accented letter counts as two.
        </p>
        {fieldsByStore().map(({ store, fields }) => (
          <div key={store.id}>
            <h4>{store.label}</h4>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Field</th>
                    <th scope="col">Limit</th>
                    <th scope="col">Lines</th>
                    <th scope="col">Required</th>
                    <th scope="col">Promotional-language checks</th>
                    {store.id === 'google' && <th scope="col">Copy from iOS</th>}
                    <th scope="col">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => (
                    <tr key={field.id}>
                      <th scope="row">{field.label}</th>
                      <td>{formatLimit(field.limit)}</td>
                      <td>{field.multiline ? 'Multi-line' : 'Single line'}</td>
                      <td>{field.required ? 'Yes' : 'No'}</td>
                      <td>{field.checks.includes('discouraged') ? 'Yes' : 'No'}</td>
                      {store.id === 'google' && (
                        <td>{field.copyFrom ? fieldLabel(field.copyFrom) : '–'}</td>
                      )}
                      <td>{field.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </Section>

      <Section id="help-cleanup" title={title('help-cleanup')}>
        <p>
          Cleanup changes characters and spacing and never the wording. After every clean, Mulligan
          compares the words and numbers of the result with the source, and reports a failure if
          they differ. Review changes, under each field, shows the source and the result side by
          side with every change marked, and the changes marked “can be reverted” have a Revert
          button for the cases where a rule gets it wrong. A revert is remembered until the source
          text is edited, since the change it refers to may no longer exist.
        </p>
        <p>The rules run in this order:</p>
        <dl className={styles.rules}>
          {changes.map((rule) => (
            <div key={rule.id}>
              <dt>
                {rule.title}
                {context.rules.revertible[rule.id] && (
                  <span className={styles.tag}>can be reverted</span>
                )}
              </dt>
              <dd>{ruleNote(rule.id, context)}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="help-checks" title={title('help-checks')}>
        <p>
          Checks run on the cleaned result, and each one reports a warning or a failure. A warning
          is worth a look but may be acceptable, such as a crop that loses part of a landscape
          capture. A failure is something the store would reject, such as copy over the limit or an
          image of the wrong size. Neither stops you from downloading: when the package has
          failures, Mulligan lists them and asks before downloading, and the manifest records them
          either way.
        </p>
        {checkAreas.map(({ label, rules: areaRules }) => (
          <div key={label}>
            <h4>{label}</h4>
            <dl className={styles.rules}>
              {areaRules.map((rule) => (
                <div key={rule.id}>
                  <dt>
                    {rule.title}
                    <span className={styles.tag}>{rule.severity}</span>
                  </dt>
                  <dd>{ruleNote(rule.id, context)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </Section>

      <Section id="help-copying" title={title('help-copying')}>
        <p>
          Agencies usually deliver one version of the copy, written for the App Store. Google Play
          fields that have an App Store counterpart carry a Copy from iOS button, which copies that
          field’s source into the Google Play field, where it is cleaned and checked against Google
          Play’s own limits. If the Google Play field already holds different copy, Mulligan asks
          before replacing it. The copy is made once: later edits to the App Store field do not
          carry across.
        </p>
        <p>
          Copy can also arrive as a template. The Listing tab offers a CSV and a JSON template to
          send to the agency, and importing a filled-in template fills each field it names, asking
          before overwriting a field that already has copy. CSV files saved from Excel on Windows
          are read correctly, and the detected encoding is shown. The <code>listing.json</code> file
          from an earlier package can be imported the same way.
        </p>
      </Section>

      <Section id="help-package" title={title('help-package')}>
        <p>
          The Package tab lists every file the package will contain, with the warnings and failures
          across the workspace, and the Download package button writes one ZIP file named with the
          date and time. Images go into one folder per preset, named <code>sequence_name.png</code>,
          for example <code>iphone-6.9/01_home-screen.png</code>, where the name is the original
          file name reduced to lowercase letters, numbers and hyphens. Icons share an{' '}
          <code>icons</code> folder, with the store in the file name.
        </p>
        <p>
          When the listing has copy, a <code>listing</code> folder holds <code>listing.txt</code>,
          with every cleaned field under a heading, ready to copy from, and{' '}
          <code>listing.json</code>, with the same values and every finding and change. The package
          always includes <code>manifest.json</code>, which records the rules version, each source
          file with its fingerprint, and each output with its crop, size and findings, so a package
          can be traced back to what produced it.
        </p>
      </Section>

      <Section id="help-storage" title={title('help-storage')}>
        <p>
          Mulligan saves your work as you go, in this browser’s own storage on this device. The
          saved session holds the source images you dropped, the copy you pasted, your preset
          choices and any reverted changes; rendered files are not saved, because they can be made
          again from the sources. Reloading the page or restarting the browser brings the session
          back, and nothing is uploaded or shared with other devices or other browsers.
        </p>
        <p>
          Only pages from this site can read the saved session. A session that has not been touched
          for {retention} is deleted the next time Mulligan opens, and the saved images are capped
          at {formatBytes(SESSION.maxPersistedBytes)} per session: an image that does not fit is
          still processed, with a notice that it was not saved on this device. Private browsing
          windows, and browsers set to refuse storage, cannot keep a session; Mulligan then shows a
          “Not saved on this device” banner and works from memory until the tab is closed.
        </p>
        <p>
          Use one Mulligan tab at a time. Two tabs share the same saved session, and whichever saves
          last replaces the other’s work.
        </p>
      </Section>

      <Section id="help-reset" title={title('help-reset')}>
        <p>
          To remove a single image, use its Remove button in the Images tab; to clear a field,
          delete its text. To start over, use Clear session in the header. It asks first, then
          removes the saved images and copy from this browser and resets the workspace. On a shared
          computer, clear the session when you finish.
        </p>
        <p>
          Clear session reports success only when the browser confirms the data is gone. If the
          browser refuses, the work stays on screen and a notice says it is still stored. In that
          case, clear the site’s data in the browser itself:
        </p>
        <ul>
          <li>
            Chrome and Edge: click the icon to the left of the address, choose Site settings, then
            Delete data.
          </li>
          <li>
            Safari: open Settings, then Privacy, then Manage Website Data, find this site and choose
            Remove.
          </li>
          <li>
            Firefox: click the padlock in the address bar and choose Clear cookies and site data.
          </li>
        </ul>
      </Section>
    </Page>
  );
}
