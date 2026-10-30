# Mulligan – Requirements

**A note on this document.** These requirements were written when Mulligan was planned as an internal tool for one team, and they are kept here as written, as the starting point for the [technical specification](Mulligan%20Technical%20Specification.md). Two things changed on the way to the published app. Mulligan became a public site with no access controls, because the case for restricting it fell away once the design kept every file and every piece of copy on the user's device: the Content-Security-Policy forbids the page from making network requests at all, so there is nothing on the server worth protecting, and section 10 of the specification sets out the threat model that replaced access control. The listing-copy cleanup also grew from a goal into half of the application. Where this document and the specification differ, the specification describes what Mulligan does.

The application will be called Mulligan, a golfer's term for a do-over, which alludes to the agency-supplied assets it exists to correct.

## Background

Our outside agencies regularly deliver mobile app screenshots and store artwork that do not conform to the dimensions required by the Apple App Store and Google Play. In many cases the screenshots are long, full-page website captures that were submitted for MLR review, and the icon and feature graphic files arrive as separate art at arbitrary sizes. Since MLR has already reviewed the application itself, our view is that a consistent, mechanical crop and resize is sufficient to produce store-ready assets.

Public resizing services have proven unreliable and cluttered, and the work machine in question runs Windows without Photoshop, so we would suggest a small internal web application that handles this in batches.

The same agencies also supply the listing copy, which tends to arrive with comparable problems: fields that exceed the store limits, text pasted from Word or an HTML page carrying stray markup and invisible characters, emoji the stores discourage, and line breaks that do not survive the move into App Store Connect or the Play Console. We would suggest that the application check and clean this copy in the same session as the images, so that one pass produces a complete, store-ready listing package; the requirements for that are set out under Store listing text below.

## Goals

- Upload a batch of image files, select one or more target sizes, and download the resized results.
- Produce assets that meet current Apple App Store and Google Play dimension requirements.
- Keep the set of output sizes selectable by the user and extensible through configuration.
- Avoid sending any image to a third-party service.

## Hosting and architecture

The application should be a static single-page web app hosted in an AWS S3 bucket, optionally fronted by CloudFront for HTTPS and access control. All image processing should take place in the browser using the Canvas API (or OffscreenCanvas in a web worker for larger batches), so that files are never uploaded to a server. On our current reading this keeps hosting cost negligible and removes most data-handling concerns, since the bucket only serves the application code.

Access should be restricted to internal users, for example through CloudFront with a signed-cookie or IP restriction, or behind existing corporate SSO if that proves practical.

## Processing rules

Each output size is defined by a target width, height, file format, and crop anchor. For each source file and each selected target, the app should:

1. Crop the source to the target aspect ratio, using the crop anchor for that asset type.
2. Scale the cropped image to the exact target pixel dimensions. Where the source is smaller than the target, it is upscaled, and the app should show a warning that the result may be soft.
3. Encode the output in the required format, flattening any transparency where the store requires it.

Crop anchors by asset type:

- Screenshots: top-anchored, so that the header and status area are preserved and the lower portion of long captures is discarded.
- Feature graphic and app icon: center-anchored.

## Initial output presets

These values reflect current store guidance as we understand it and should be verified against Apple and Google documentation before release.

| Preset | Dimensions | Notes |
| --- | --- | --- |
| iPhone 6.3" screenshot | 1206 × 2622 | Primary iPhone size, for the 6.1" and 6.3" display slot |
| iPhone 6.1" screenshot | 1179 × 2556 | Alternative size for the same slot |
| iPad 13" screenshot | 2064 × 2752 | Required if the app supports iPad |
| Android phone screenshot | 1080 × 1920 | 9:16 portrait |
| Android 7" tablet screenshot | 1200 × 1920 | Optional |
| Android 10" tablet screenshot | 1600 × 2560 | Optional |
| Google Play feature graphic | 1024 × 500 | JPEG or 24-bit PNG, no alpha |
| Google Play app icon | 512 × 512 | 32-bit PNG, under 1 MB |
| Apple App Store icon | 1024 × 1024 | PNG, no transparency |

Presets should live in a single JSON configuration file so that new sizes or asset types can be added without code changes. Each entry would carry a name, group (screenshot, icon, feature graphic), dimensions, format, crop anchor, and whether alpha is permitted.

## User interface

- A drag-and-drop area accepting PNG and JPEG files, with multiple files per batch.
- Preset selection grouped by asset type, with checkboxes so that several outputs can be produced from one upload.
- A preview of each result showing the crop region before download.
- A single ZIP download of all outputs, organized and named as described in the next section, for example `iphone-6.3/01_home-screen.png`.
- Warnings for upscaled outputs and for files that could not be read.

## Output packaging and file naming

A full set of screenshots for a standard app, typically six, should be uploaded and converted in one operation, with every selected preset applied to every file. For example, six screenshots across three presets yield 18 files in a single download.

- The ZIP contains one folder per preset, for example `iphone-6.3/`, `ipad-13/`, `android-phone/`, `play-feature-graphic/` and `icons/`, so that each set can be uploaded to its store directly.
- File names begin with a two-digit sequence number reflecting upload order, followed by the source file name, for example `iphone-6.3/01_home-screen.png`, `iphone-6.3/02_dashboard.png`.
- Since browsers do not guarantee the order of files dropped together, the app should list the files after upload in the order received and allow them to be reordered by dragging before conversion; the sequence numbers follow that final order.
- Sequence numbering should be consistent across folders, so that file 03 refers to the same source image in every preset.

## Store listing text

### Purpose

Since the listing copy will usually have been through MLR review already, this part of the application should restrict itself to mechanical corrections of characters and whitespace, and should never change wording. As with the images, all processing takes place in the browser, so no listing text is sent to a server.

### Input

- A form with one field per listing element, grouped by store, that accepts pasted content. Paste handling should read the HTML clipboard format where it is present, so that paragraph and list structure from Word or a web page can be interpreted rather than lost.
- Import from a CSV or JSON template, which we can offer to agencies. We would not rely on it, since our expectation is that agencies will continue to paste copy in from Word and may fill a template the same way, so every imported file passes through the same normalization and checks as pasted text.
- Import of a .docx file, if this proves practical in the browser, which we would treat as a later enhancement.

### Field definitions

These limits reflect current published store guidance as we understand it and should be confirmed in App Store Connect and the Play Console before release. Field definitions should live in the same JSON configuration file as the image presets, so that limits can be updated and fields added without code changes.

| Store | Field | Limit | Notes |
| --- | --- | --- | --- |
| Apple | App name | 30 characters | Minimum of 2 characters |
| Apple | Subtitle | 30 characters |  |
| Apple | Promotional text | 170 characters | Editable without a new app version |
| Apple | Description | 4,000 characters | Plain text only |
| Apple | Keywords | 100 bytes | Comma-separated; counted in bytes, so accented and non-Latin characters count for more than one |
| Apple | What's New | 4,000 characters |  |
| Google Play | App title | 30 characters |  |
| Google Play | Short description | 80 characters |  |
| Google Play | Full description | 4,000 characters |  |
| Google Play | Release notes | 500 characters |  |

Each entry in the configuration would carry the store, field name, limit, unit of measure (characters or bytes), whether line breaks are permitted, and any field-specific rules.

### Normalization rules

The application should apply the following transformations in order, and record each one for the change report.

#### HTML and rich text

- Strip all HTML tags and decode entities such as `&amp;` and `&nbsp;`.
- Convert paragraph and line-break elements into line breaks, so that the paragraph structure of the source is preserved.
- Convert list items into lines beginning with an en dash and a space (` –  `), since both stores render plain text only. The same en dash should replace any other bullet characters found in the source, such as `•`, `·` or `*`.

#### Characters

- Remove emoji, including multi-part sequences joined with zero-width joiners, skin-tone modifiers and emoji variation selectors.
- Preserve ®, ™ and © as text symbols. These appear on some emoji lists, and since our copy relies on them for trademark notation, the emoji filter must exclude them explicitly and drop only the variation selector that would render them as emoji.
- Remove invisible characters, including zero-width spaces, soft hyphens, byte-order marks and directional marks.
- Replace non-breaking spaces and other unusual space characters with ordinary spaces.
- Offer, as a per-field option, conversion of curly quotes and apostrophes to straight ones. Both stores accept curly quotes, so we would suggest leaving this off by default.

#### Line breaks and whitespace

- Normalize all line endings to a single newline, including the vertical tab character that Word uses for a manual line break.
- Rejoin lines that were hard-wrapped in the middle of a sentence, automatically and on every multi-line field, since this is the most common damage from copying out of Word or a PDF. A line break should be kept where the preceding line ends in terminal punctuation, the next line begins a list item, or a blank line follows; otherwise the two lines are joined with a single space. Each rejoin appears in the change report, so that a reviewer can see where it happened and restore an intended break if the rule misjudged it.
- Collapse runs of blank lines into a single blank line between paragraphs.
- Trim leading and trailing whitespace from each line and from the field as a whole, and collapse repeated spaces within a line.
- Remove line breaks entirely from single-line fields, such as the app name, subtitle, short description and keywords.

#### Keywords

- Split on commas, trim the spaces around each keyword, and rejoin without spaces, since Apple counts those spaces against the limit.
- Flag duplicate keywords and keywords that repeat words already present in the app name or subtitle.

### Checks and warnings

After normalization, the application should check each field and report the result as a pass, warning or failure.

- Failure: the cleaned text exceeds the field limit. The report should show the count against the limit and highlight the text past the cutoff. The application should not truncate the copy itself, since a shortened version would require fresh approval.
- Failure: a required field is empty.
- Warning: the text contains patterns the stores discourage in titles and short descriptions, such as words in all capitals, repeated punctuation, or terms like “free”, “best” or “#1”.
- Warning: characters remain that could not be classified, so that someone can look at them before submission.

### Review and output

- For each field, a side-by-side view of the original and cleaned text, with every change highlighted, so that a reviewer can confirm that only characters and whitespace were altered.
- A live character or byte count for each field against its limit.
- A copy button for each cleaned field, for pasting directly into App Store Connect or the Play Console.
- An export of the cleaned listing as a text file and a JSON file, placed in a `listing/` folder in the same ZIP as the resized images, so that one download holds the full submission package.

## Shared rules library

### Purpose

We expect to want the same checks in other settings later, most likely as a step in a CI/CD pipeline that validates store assets and listing copy before a release is submitted. Our view is that there should be one authoritative set of standards, so that a file accepted by the web application is accepted by the pipeline and the reverse. The first version should therefore be built with the rules and verification logic separated from the user interface, in a form that can later be packaged and reused without rework, even though the pipeline integration itself is deferred.

### Structure

We would suggest three layers:

- A rules library containing the image presets, listing field definitions, normalization rules and checks, with no dependency on the browser, the DOM or any particular user interface.
- The web application described in this document, which calls the library for every decision it makes and holds no rules of its own.
- A command-line tool, added later, which calls the same library and is suitable for running in a pipeline.

### Library requirements

- Written in TypeScript and published as a versioned package, in a form that runs unchanged in modern browsers and in Node.js.
- All presets, field definitions and rule settings held in the library's configuration and versioned with it, so that a given library version always applies the same standards.
- Text normalization and checks implemented as pure functions that take text and a field definition and return the cleaned text, the list of changes made and the list of check results, with no side effects.
- Image handling split into two parts: the decisions, meaning the crop rectangle, target dimensions, format, alpha handling and warnings, which live in the library as pure functions; and the pixel operations, which sit behind a small interface with one implementation using the browser Canvas API and, later, one using a Node image library. Since two rendering engines will not produce byte-identical pixels, our expectation is that both paths share identical decisions and dimensions, with visual output that matches closely rather than exactly.
- Results returned in a structured, documented format, with each finding carrying a stable rule identifier, a severity of pass, warning or failure, the field or file concerned and a readable message, so that the same result can be rendered in the web application, written to a pipeline report or consumed by other tools.
- The library version and rule set version recorded in every export, including the JSON listing file and a manifest in the ZIP, so that any output can be traced to the standards that produced it.

### Command-line tool requirements

These are recorded now to guide the library design and are not part of the first version.

- Accept a folder of images, a listing file in the JSON or CSV template format, or both.
- Offer a check mode, which reports findings without changing anything, and a fix mode, which writes normalized text and resized images to an output folder in the same structure as the web application's ZIP.
- Exit with a nonzero status when any failure is found, and optionally when warnings are found, so that a pipeline step can block a release.
- Write findings as JSON and in a common test-report format such as JUnit XML, so that CI platforms can display them without custom work.
- Allow a project to pin a library version and to override presets or limits through a local configuration file, with any override noted in the report.

### Testing

- A shared set of fixture files, including Word and HTML pastes, emoji and trademark cases, hard-wrapped text, long website captures and undersized icons, with the expected results for each.
- The same fixtures run against the library in both the browser and Node.js as part of the library's own test suite, so that any divergence between the two environments is caught before release.

## Out of scope for the first version

- Slicing long captures into multiple frames.
- Manual adjustment of the crop region, which we may want to revisit if the fixed anchors prove insufficient.
- Device frames, captions, or other marketing overlays.
- Direct upload to App Store Connect or the Google Play Console.

* Rewording, shortening or optimizing listing copy for search.
* Translation or management of multiple locales, although the configuration should not preclude adding locales later.
* Checking listing copy against approved MLR content or claims.

- The command-line tool and any CI/CD integration, beyond structuring the rules library so that they can be added later.

## Open questions

- Which access-control approach is preferred for the S3-hosted app.
- Whether a maximum file size or batch size should be enforced to keep browser memory use reasonable.

* Which CI/CD platforms the command-line tool should support first, and whether the library should be published to a private package registry or to the public npm registry if the application is made public.
