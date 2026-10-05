import { BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BookBuild } from '../../src/shared/export/assemble';
import { layoutWithGutter } from '../../src/shared/export/gutter';
import { buildPrintHtml, postLayoutConfig, type PrintLayout } from '../../src/shared/export/printHtml';
import { estimatePages, KDP_MAX_PAGES, KDP_MIN_PAGES, trimByKey } from '../../src/shared/export/trim';

/** Where the print pipeline finds its bundled files. */
export interface PdfResources {
  /** Folder holding the EB Garamond .woff2 files. */
  fontsDir: string;
  /** Path to Paged.js's paged.polyfill.js. */
  pagedJsPath: string;
}

export interface PdfProgress {
  stage: 'preparing' | 'laying-out' | 'printing';
  /** Pages laid out so far (only during 'laying-out'). */
  page?: number;
  /** Which layout pass this is (the gutter may need a second pass). */
  pass?: number;
}

export interface PdfResult {
  bytes: Uint8Array;
  pages: number;
  gutter: number;
  warnings: string[];
}

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

/** @font-face rules with the font files inlined, so the page needs no file access. */
export async function loadFontCss(fontsDir: string): Promise<string> {
  const faces: string[] = [];
  for (const [subset, range] of [['latin', LATIN], ['latin-ext', LATIN_EXT]] as const) {
    for (const weight of [400, 700]) {
      for (const style of ['normal', 'italic']) {
        const data = await fs.readFile(path.join(fontsDir, `eb-garamond-${subset}-${weight}-${style}.woff2`));
        faces.push(
          `@font-face { font-family: "EB Garamond"; font-style: ${style}; font-weight: ${weight}; font-display: block; src: url(data:font/woff2;base64,${data.toString('base64')}) format("woff2"); unicode-range: ${range}; }`
        );
      }
    }
  }
  return faces.join('\n');
}

interface Rendered {
  pdf: Buffer;
  pages: number;
}

/** Lays out one HTML document with Paged.js in a hidden window and prints it to PDF. */
async function renderHtml(
  html: string,
  post: { firstBodyId: string; config: unknown },
  onProgress: (p: PdfProgress) => void,
  pass: number,
  signal?: AbortSignal
): Promise<Rendered> {
  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 1400,
    // Offscreen rendering keeps producing frames. A merely hidden window gets none, and Paged.js waits
    // on animation frames between pages (laying out a book took ~1 s per page instead of ~20 ms).
    webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false, spellcheck: false, offscreen: true }
  });
  win.webContents.setFrameRate(60);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mdedit-print-'));
  let poll: NodeJS.Timeout | undefined;
  const abort = () => win.destroy();
  signal?.addEventListener('abort', abort);
  try {
    const file = path.join(dir, 'book.html');
    await fs.writeFile(file, html);
    await win.loadFile(file);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');

    poll = setInterval(() => {
      if (win.isDestroyed()) return;
      win.webContents
        .executeJavaScript('document.querySelectorAll(".pagedjs_page").length')
        .then((n: number) => onProgress({ stage: 'laying-out', page: n, pass }))
        .catch(() => undefined);
    }, 400);
    const pages: number = await win.webContents.executeJavaScript(
      `window.PagedPolyfill.preview().then(() => window.__mdeditPostLayout(${JSON.stringify(post.firstBodyId)}, ${JSON.stringify(post.config)}))`
    );
    clearInterval(poll);
    onProgress({ stage: 'printing', pass });
    const pdf = await win.webContents.printToPDF({ preferCSSPageSize: true, printBackground: false, margins: { marginType: 'none' } });
    return { pdf, pages };
  } finally {
    if (poll) clearInterval(poll);
    signal?.removeEventListener('abort', abort);
    if (!win.isDestroyed()) win.destroy();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Builds the KDP print-interior PDF for a book. Runs in the Electron main process. */
export async function buildPrintPdf(
  book: BookBuild,
  resources: PdfResources,
  onProgress: (p: PdfProgress) => void = () => undefined,
  signal?: AbortSignal
): Promise<PdfResult> {
  const s = book.settings.pdf;
  const trim = trimByKey(s.trim);
  onProgress({ stage: 'preparing' });
  const [fontCss, paged] = await Promise.all([loadFontCss(resources.fontsDir), fs.readFile(resources.pagedJsPath, 'utf8')]);
  const scripts = `<script>window.PagedConfig = { auto: false };</script>\n<script>${paged.replace(/<\/script/gi, '<\\/script')}</script>`;

  const estimate = estimatePages({
    words: book.totalWords,
    chapters: book.chapters.length,
    trim,
    fontSize: s.fontSize,
    outerMargin: s.outerMargin,
    topMargin: s.topMargin,
    bottomMargin: s.bottomMargin,
    frontPages: book.front.length * 2 + 2
  });

  let pass = 0;
  const result = await layoutWithGutter({
    auto: s.gutter === 'auto',
    manualGutter: s.gutter === 'auto' ? 0 : s.gutter,
    estimatedPages: estimate,
    render: async (gutter) => {
      pass++;
      const layout: PrintLayout = { trimKey: s.trim, gutter, outer: s.outerMargin, top: s.topMargin, bottom: s.bottomMargin };
      const r = await renderHtml(buildPrintHtml(book, layout, { fontCss, scripts }), { firstBodyId: book.chapters[0].id, config: postLayoutConfig(book) }, onProgress, pass, signal);
      return { output: r.pdf, pages: r.pages };
    }
  });

  const warnings: string[] = [];
  if (result.pages < KDP_MIN_PAGES) warnings.push(`The interior is ${result.pages} pages; KDP paperbacks need at least ${KDP_MIN_PAGES}.`);
  if (result.pages > KDP_MAX_PAGES) warnings.push(`The interior is ${result.pages} pages; KDP's maximum is ${KDP_MAX_PAGES}.`);
  if (s.gutter !== 'auto' && result.gutter < 0.375) warnings.push('The inside margin is narrower than KDP recommends (0.375 in minimum).');
  return { bytes: new Uint8Array(result.output), pages: result.pages, gutter: result.gutter, warnings };
}
