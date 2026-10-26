import { Parser } from 'htmlparser2';
import type { Standards } from '../../standards/schema.ts';
import type { RawFieldInput, Span } from '../types.ts';

/** A change made while turning HTML into the baseline text (spec §6.2). */
export interface ExtractionChange {
  ruleId: 'html.extract' | 'html.list-item';
  baselineSpan: Span;
  before: string;
  after: string;
  detail?: string;
}

export interface Extraction {
  baseline: string;
  /** True when the baseline was extracted from HTML. */
  fromHtml: boolean;
  changes: ExtractionChange[];
}

const SKIPPED = new Set(['head', 'style', 'script', 'template', 'title', 'noscript', 'xml', 'o:p']);
const PARAGRAPH = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const BLOCK = new Set([
  'div',
  'li',
  'tr',
  'blockquote',
  'pre',
  'ul',
  'ol',
  'table',
  'section',
  'article',
  'header',
  'footer',
  'dl',
  'dt',
  'dd',
  'figure',
  'figcaption',
  'address',
  'hr',
  'main',
  'aside',
  'nav',
]);
const CELL = new Set(['td', 'th']);
const ASCII_WHITESPACE = /[ \t\n\f\r]+/g;
const ORDERED_MARKER = /^\s*(\d+|[a-z]|[ivxlc]+)[.)]/i;
const ENTITY = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi;

/** Only the clipboard fragment, when the HTML marks one. */
function fragmentOf(html: string): string {
  const start = html.indexOf('<!--StartFragment-->');
  const end = html.indexOf('<!--EndFragment-->');
  if (start >= 0 && end > start) return html.slice(start + '<!--StartFragment-->'.length, end);
  return html;
}

function isWordListParagraph(attributes: Record<string, string>): boolean {
  return (
    /MsoListParagraph/i.test(attributes['class'] ?? '') ||
    /mso-list:\s*l\d/i.test(attributes['style'] ?? '')
  );
}

/**
 * Turn the field input into the baseline text. HTML is converted to structured plain text;
 * plain text is used unchanged.
 */
export function extractBaseline(input: RawFieldInput, standards: Standards): Extraction {
  if (input.html === undefined || input.html.trim() === '') {
    return { baseline: input.text, fromHtml: false, changes: [] };
  }

  const { bullet, orderedStyle } = standards.rules.lists;
  const html = fragmentOf(input.html);
  let out = '';
  let pendingBreaks = 0;
  let pendingPrefix: string | null = null;
  let pendingSpace = false;
  let skipDepth = 0;
  let preDepth = 0;
  let liDepth = 0;
  let inSupportLists = false;
  let supportListsText = '';
  let tags = 0;
  const lists: { ordered: boolean; counter: number }[] = [];
  const wordListParagraphs: boolean[] = [];
  const listItems: ExtractionChange[] = [];

  const requestBreak = (count: number) => {
    if (pendingPrefix !== null) return; // keep a list marker on the same line as its text
    pendingBreaks = Math.max(pendingBreaks, count);
    pendingSpace = false;
  };

  /** Start a list item; `marker` is the number of an ordered item ("1.") or null. */
  const startListItem = (marker: string | null) => {
    requestBreak(1);
    pendingPrefix = marker !== null && orderedStyle === 'number' ? `${marker} ` : bullet;
  };

  const emit = (raw: string) => {
    let text = raw;
    if (preDepth === 0) {
      text = text.replace(ASCII_WHITESPACE, ' ');
      if (text === ' ') {
        if (out !== '' && pendingBreaks === 0) pendingSpace = true;
        return;
      }
      if (text.startsWith(' ')) {
        if (out !== '' && pendingBreaks === 0) pendingSpace = true;
        text = text.slice(1);
      }
      const trailing = text.endsWith(' ');
      if (trailing) text = text.slice(0, -1);
      flush();
      out += text;
      pendingSpace = trailing;
      return;
    }
    flush();
    out += text;
  };

  const flush = () => {
    if (out !== '' && pendingBreaks > 0) {
      out = out.replace(/ +$/, '');
      out += '\n'.repeat(pendingBreaks);
    } else if (pendingSpace && out !== '' && !out.endsWith('\n')) {
      out += ' ';
    }
    pendingBreaks = 0;
    pendingSpace = false;
    if (pendingPrefix !== null) {
      const start = out.length;
      out += pendingPrefix;
      listItems.push({
        ruleId: 'html.list-item',
        baselineSpan: { start, end: out.length },
        before: '',
        after: pendingPrefix,
        detail: 'List item converted to a text line',
      });
      pendingPrefix = null;
    }
  };

  const breakFor = (name: string): number => (PARAGRAPH.has(name) && liDepth === 0 ? 2 : 1);

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        tags += 1;
        if (skipDepth > 0 || SKIPPED.has(name)) {
          skipDepth += 1;
          return;
        }
        if (name === 'br') {
          // A line break adds one line to whatever break is pending; ignored before any text
          // and between a list marker and its text.
          if (pendingPrefix === null && out !== '') {
            pendingBreaks += 1;
            pendingSpace = false;
          }
          return;
        }
        if (name === 'pre') preDepth += 1;
        if (name === 'ul' || name === 'ol') {
          lists.push({ ordered: name === 'ol', counter: 0 });
          requestBreak(1);
          return;
        }
        if (name === 'li') {
          liDepth += 1;
          const list = lists[lists.length - 1];
          const ordered = list?.ordered ?? false;
          if (list) list.counter += 1;
          startListItem(ordered ? `${list!.counter}.` : null);
          return;
        }
        if (name === 'p' && isWordListParagraph(attributes)) {
          wordListParagraphs.push(true);
          requestBreak(1);
          return;
        }
        if (name === 'p') wordListParagraphs.push(false);
        if (PARAGRAPH.has(name) || BLOCK.has(name)) requestBreak(breakFor(name));
        else if (CELL.has(name) && out !== '' && !out.endsWith('\n')) pendingSpace = true;
      },
      onclosetag(name, isImplied) {
        if (!isImplied && name !== 'br') tags += 1;
        if (skipDepth > 0) {
          skipDepth -= 1;
          return;
        }
        if (name === 'pre') preDepth = Math.max(0, preDepth - 1);
        if (name === 'ul' || name === 'ol') {
          lists.pop();
          // A paragraph break after a top-level list, so following text is not read as a
          // continuation of the last item.
          requestBreak(lists.length === 0 ? 2 : 1);
          return;
        }
        if (name === 'li') {
          liDepth = Math.max(0, liDepth - 1);
          pendingPrefix = null;
          requestBreak(1);
          return;
        }
        if (name === 'p') {
          const wordList = wordListParagraphs.pop() ?? false;
          requestBreak(wordList ? 1 : breakFor(name));
          return;
        }
        if (PARAGRAPH.has(name) || BLOCK.has(name)) requestBreak(breakFor(name));
        else if (CELL.has(name)) pendingSpace = true;
      },
      oncomment(data) {
        const marker = data.trim().toLowerCase();
        if (marker === '[if !supportlists]') {
          inSupportLists = true;
          supportListsText = '';
          skipDepth += 1;
        } else if (marker === '[endif]' && inSupportLists) {
          inSupportLists = false;
          skipDepth = Math.max(0, skipDepth - 1);
          const ordered = ORDERED_MARKER.exec(supportListsText.replace(/\u00A0/g, ' '));
          startListItem(ordered ? `${ordered[1]}${ordered[0].trim().slice(-1)}` : null);
        }
      },
      ontext(text) {
        if (inSupportLists) {
          supportListsText += text;
          return;
        }
        if (skipDepth > 0) return;
        emit(text);
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(html);
  parser.end();

  const baseline = out.replace(/[ \n]+$/, '');
  const entities = (html.match(ENTITY) ?? []).length;
  const detail = `${tags} ${tags === 1 ? 'tag' : 'tags'} removed, ${entities} ${
    entities === 1 ? 'entity' : 'entities'
  } decoded`;
  return {
    baseline,
    fromHtml: true,
    changes: [
      {
        ruleId: 'html.extract',
        baselineSpan: { start: 0, end: baseline.length },
        before: '',
        after: '',
        detail,
      },
      ...listItems.filter((item) => item.baselineSpan.end <= baseline.length),
    ],
  };
}
