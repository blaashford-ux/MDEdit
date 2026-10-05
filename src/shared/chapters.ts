/**
 * Lossless chapter splitting for Markdown files.
 *
 * A chapter starts at each Heading 1 (ATX `# Title` or Setext `Title` + `===`).
 * Text before the first H1 is a "preamble" chapter. Each chapter keeps its exact
 * original text (`raw`, including line endings), so joinChapters(splitChapters(x)) === x
 * and editing one chapter never alters the others.
 */

export interface Chapter {
  /** Heading text, or '' for a preamble. */
  title: string;
  /** True for the text before the first H1 (front matter, intro). */
  isPreamble: boolean;
  /** Exact source text of this chapter, line endings included. */
  raw: string;
}

export interface MarkdownDoc {
  chapters: Chapter[];
  /** Leading UTF-8 BOM, if the file had one. */
  bom: string;
  /** Dominant line ending, used for newly written text. */
  eol: '\n' | '\r\n';
}

const ATX_H1 = /^ {0,3}#(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const SETEXT_H1_UNDERLINE = /^ {0,3}=+[ \t]*$/;
const BLOCK_STARTER = /^(?: {4,}|\t|>|[-*+](?:\s|$)|\d{1,9}[.)](?:\s|$)|#|`{3,}|~{3,}|<)/;

function stripClosingHashes(s: string): string {
  return s.replace(/[ \t]+#+[ \t]*$/, '').replace(/^#+[ \t]*$/, '').trim();
}

export function detectEol(text: string): '\n' | '\r\n' {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;
  return crlf > lf ? '\r\n' : '\n';
}

interface Line {
  /** Line content without terminator. */
  text: string;
  /** Offset of the line start within the source. */
  start: number;
}

function toLines(text: string): Line[] {
  const lines: Line[] = [];
  const re = /\r\n|\n|\r/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    lines.push({ text: text.slice(start, m.index), start });
    start = m.index + m[0].length;
  }
  if (start < text.length) lines.push({ text: text.slice(start), start });
  return lines;
}

export function splitChapters(source: string): MarkdownDoc {
  const bom = source.startsWith('﻿') ? '﻿' : '';
  const text = bom ? source.slice(1) : source;
  const lines = toLines(text);
  const eol = detectEol(text);

  const starts: { offset: number; title: string }[] = [];
  let i = 0;

  // YAML front matter belongs to the preamble; '#' comments inside it are not headings.
  if (lines.length > 0 && /^---[ \t]*$/.test(lines[0].text)) {
    for (let j = 1; j < lines.length; j++) {
      if (/^(?:---|\.\.\.)[ \t]*$/.test(lines[j].text)) {
        i = j + 1;
        break;
      }
    }
  }

  let fence: { char: string; len: number } | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i].text;

    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.char === '`' ? '`' : '~'}{${fence.len},}[ \\t]*$`);
      if (close.test(line)) fence = null;
      continue;
    }

    const open = FENCE_OPEN.exec(line);
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = { char: open[1][0], len: open[1].length };
      continue;
    }

    const atx = ATX_H1.exec(line);
    if (atx) {
      starts.push({ offset: lines[i].start, title: stripClosingHashes(atx[1] ?? '') });
      continue;
    }

    // Setext: a one-line paragraph followed by ===
    const prev = i > 0 ? lines[i - 1].text : '';
    const startsParagraph = i === 0 || prev.trim() === '' || ATX_H1.test(prev) || /^ {0,3}#{1,6}(\s|$)/.test(prev);
    if (
      startsParagraph &&
      line.trim() !== '' &&
      !BLOCK_STARTER.test(line) &&
      i + 1 < lines.length &&
      SETEXT_H1_UNDERLINE.test(lines[i + 1].text)
    ) {
      starts.push({ offset: lines[i].start, title: line.trim() });
      i++; // skip the underline
    }
  }

  const chapters: Chapter[] = [];
  const firstOffset = starts.length ? starts[0].offset : text.length;
  if (firstOffset > 0 || starts.length === 0) {
    chapters.push({ title: '', isPreamble: true, raw: text.slice(0, firstOffset) });
  }
  starts.forEach((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].offset : text.length;
    chapters.push({ title: s.title, isPreamble: false, raw: text.slice(s.offset, end) });
  });

  return { chapters, bom, eol };
}

export function joinChapters(doc: MarkdownDoc): string {
  return doc.bom + doc.chapters.map((c) => c.raw).join('');
}

/**
 * Replace one chapter's text, leaving all others byte-identical.
 * Newlines in `newRaw` are normalised to the document's line ending. The chapter keeps
 * its original run of trailing newlines (blank lines before the next heading, or no final
 * newline at end of file), because WYSIWYG editors don't preserve those.
 * Returns a new document (the input is not mutated).
 */
export function updateChapter(doc: MarkdownDoc, index: number, newRaw: string): MarkdownDoc {
  if (index < 0 || index >= doc.chapters.length) throw new RangeError(`No chapter at index ${index}`);
  const trailing = /(?:\r\n|\r|\n)*$/.exec(doc.chapters[index].raw)![0];
  const isLast = index === doc.chapters.length - 1;
  const body = newRaw.replace(/(?:\r\n|\r|\n)+$/, '').replace(/\r\n|\r|\n/g, doc.eol);
  // A non-last chapter must end in a newline so the next heading starts its own line.
  const raw = body === '' ? trailing : body + (trailing || (isLast ? '' : doc.eol));
  const old = doc.chapters[index];
  const title = old.isPreamble ? '' : (splitChapters(raw).chapters.find((c) => !c.isPreamble)?.title ?? old.title);
  const chapters = doc.chapters.slice();
  chapters[index] = { ...old, title, raw };
  return { ...doc, chapters };
}

/** A chapter's text without line-ending differences or trailing newlines, for comparing content. */
export function chapterBody(raw: string): string {
  return raw.replace(/\r\n|\r/g, '\n').replace(/\n+$/, '');
}
