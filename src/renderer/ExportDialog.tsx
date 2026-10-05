import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExportPlan, ExportProgress, ExportResult } from '../shared/api';
import { splitChapters } from '../shared/chapters';
import type { BookDetails, ParagraphStyle } from '../shared/export/model';
import { formatBytes, OUTPUT_LABELS, type OutputKind } from '../shared/export/outputs';
import { TRIM_SIZES } from '../shared/export/trim';
import { basename } from '../shared/paths';
import { countWords } from '../shared/words';
import { Field, NumberField, Select, TextArea, Toggle } from './formParts';
import { useEscape } from './useEscape';

interface Props {
  /** Files currently marked for export. */
  files: string[];
  initialFile: string;
  /** Files with unsaved edits in an open tab. */
  dirtyFiles: Set<string>;
  saveFile(file: string): Promise<boolean>;
  /** Opens Book Details for a file (its dialog sits on top of this one). */
  onEditDetails(file: string): void;
  /** Bumped by the parent whenever Book Details were saved, so this dialog reloads them. */
  detailsVersion: number;
  onClose(): void;
}

const PSTYLE: { value: ParagraphStyle; label: string }[] = [
  { value: 'blockGap', label: 'Blank line between paragraphs' },
  { value: 'blockNoGap', label: 'No gap between paragraphs' },
  { value: 'indent', label: 'First-line indent' }
];
const TRIM_OPTIONS = TRIM_SIZES.map((t) => ({ value: t.key, label: `${t.label}${t.key === '5.5x8.5' ? ' (default)' : ''}` }));
const KINDS: OutputKind[] = ['epub', 'pdf', 'docx'];

type Phase = 'form' | 'running' | 'done';

export function ExportDialog({ files, initialFile, dirtyFiles, saveFile, onEditDetails, detailsVersion, onClose }: Props) {
  const [file, setFile] = useState(initialFile);
  const [details, setDetails] = useState<BookDetails | null>(null);
  const [initial, setInitial] = useState('');
  const [chapters, setChapters] = useState<{ title: string; words: number }[]>([]);
  const [plan, setPlan] = useState<ExportPlan | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const [progress, setProgress] = useState<ExportProgress[]>([]);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askDirty, setAskDirty] = useState(false);
  const runSeq = useRef(0);

  const dirtyBook = dirtyFiles.has(file);

  // ---- load the book --------------------------------------------------------------------
  useEffect(() => {
    let live = true;
    setDetails(null);
    setConfirmed(false);
    Promise.all([window.mdedit.getBookDetails(file), window.mdedit.readFile(file)])
      .then(([d, f]) => {
        if (!live) return;
        setDetails(d.details);
        setInitial(JSON.stringify(d.details));
        setChapters(splitChapters(f.text).chapters.filter((c) => !c.isPreamble).map((c) => ({ title: c.title, words: countWords(c.raw) })));
      })
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [file, detailsVersion]);

  // ---- where the files will go (reflects the form as it is now) ---------------------------
  useEffect(() => {
    if (!details) return;
    const t = setTimeout(() => {
      window.mdedit.planExport(file, details).then(setPlan).catch(() => setPlan(null));
    }, 250);
    return () => clearTimeout(t);
  }, [file, details?.title, details?.export.outputDir, details?.export.outputs.epub, details?.export.outputs.pdf, details?.export.outputs.docx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => window.mdedit.onExportProgress((p) => setProgress((prev) => [...prev, p])), []);

  const dirty = details !== null && JSON.stringify(details) !== initial;
  const running = phase === 'running';
  useEscape(() => !running && closeAndSave());

  const edit = (fn: (d: BookDetails) => void) =>
    setDetails((d) => {
      if (!d) return d;
      const next = structuredClone(d);
      fn(next);
      return next;
    });

  const closeAndSave = async () => {
    // export settings are remembered even if you don't export
    if (details && dirty) await window.mdedit.saveBookDetails(file, details).catch(() => undefined);
    onClose();
  };

  // ---- validation -------------------------------------------------------------------------
  const problems = useMemo(() => {
    if (!details) return [];
    const p: string[] = [];
    if (!details.title.trim()) p.push('The book needs a title.');
    if (!details.author.trim()) p.push('The book needs an author or pen name.');
    if (!KINDS.some((k) => details.export.outputs[k])) p.push('Choose at least one output.');
    const included = chapters.filter((c) => !details.export.excludedChapters.includes(c.title));
    if (chapters.length === 0) p.push('This file has no chapters (each chapter starts with a Heading 1).');
    else if (included.length === 0) p.push('Every chapter is excluded.');
    return p;
  }, [details, chapters]);

  const startExport = async (saveFirst: boolean) => {
    if (!details) return;
    setAskDirty(false);
    if (saveFirst && !(await saveFile(file))) {
      setError('The file could not be saved, so nothing was exported.');
      return;
    }
    setError(null);
    setProgress([]);
    setResult(null);
    setPhase('running');
    const seq = ++runSeq.current;
    try {
      await window.mdedit.saveBookDetails(file, details);
      setInitial(JSON.stringify(details));
      const r = await window.mdedit.runExport(file);
      if (seq === runSeq.current) setResult(r);
    } catch (e) {
      if (seq === runSeq.current) setResult({ ok: false, errors: [e instanceof Error ? e.message : String(e)], warnings: [], outputs: [] });
    }
    if (seq === runSeq.current) setPhase('done');
  };

  const onExportClick = () => (dirtyBook ? setAskDirty(true) : void startExport(false));

  // ---- render -----------------------------------------------------------------------------
  if (!details) {
    return (
      <div className="modal-backdrop">
        <div className="modal wide" role="dialog" aria-label="Export">
          <h3>Export</h3>
          {error ? <div className="banner error">{error}</div> : <p className="muted">Loading…</p>}
          <div className="modal-actions">
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  const e = details.export;
  const toggleOutput = (k: OutputKind, on: boolean) => edit((d) => void (d.export.outputs[k] = on));
  const included = (title: string) => !e.excludedChapters.includes(title);
  const setIncluded = (title: string, on: boolean) =>
    edit((d) => void (d.export.excludedChapters = on ? d.export.excludedChapters.filter((t) => t !== title) : [...new Set([...d.export.excludedChapters, title])]));

  return (
    <div className="modal-backdrop">
      <div className="modal wide book-dialog" role="dialog" aria-modal="true" aria-label="Export">
        <h3>Export for KDP</h3>

        {phase === 'form' && (
          <div className="dialog-body">
            {files.length > 1 && (
              <Select<string> label="Book" value={file} options={files.map((f) => ({ value: f, label: basename(f) }))} onChange={setFile} />
            )}

            <section className="readback" aria-label="Confirm title and author">
              <h4>Check these are exactly right</h4>
              <dl>
                <dt>Title</dt>
                <dd data-testid="rb-title">{details.title || <span className="bad">(missing)</span>}</dd>
                <dt>Subtitle</dt>
                <dd data-testid="rb-subtitle">{details.subtitle || <span className="muted">(none)</span>}</dd>
                <dt>Author</dt>
                <dd data-testid="rb-author">{details.author || <span className="bad">(missing)</span>}</dd>
              </dl>
              <div className="readback-actions">
                <button type="button" onClick={() => onEditDetails(file)}>
                  Edit Book Details…
                </button>
                <Toggle label="Title, subtitle and author are exactly as they should appear" checked={confirmed} onChange={setConfirmed} />
              </div>
            </section>

            {dirtyBook && (
              <div className="banner warn">
                {basename(file)} has unsaved edits. Exports use the saved file; you’ll be asked whether to save first.
              </div>
            )}

            <section>
              <h4>Outputs</h4>
              {KINDS.map((k) => (
                <div key={k} className="output-block">
                  <Toggle label={OUTPUT_LABELS[k]} checked={e.outputs[k]} onChange={(v) => toggleOutput(k, v)} />
                  {e.outputs[k] && k === 'epub' && (
                    <div className="output-panel">
                      <div className="row2">
                        <Field label="Language code" value={e.epub.language} width={160} onChange={(v) => edit((d) => void (d.export.epub.language = v))} hint="e.g. en, en-GB, fr" />
                        <Select label="Paragraphs" value={e.epub.paragraphStyle} options={PSTYLE} onChange={(v) => edit((d) => void (d.export.epub.paragraphStyle = v))} />
                      </div>
                      <TextArea label="Description" rows={3} value={e.epub.description} onChange={(v) => edit((d) => void (d.export.epub.description = v))} hint="Stored in the ebook’s metadata (KDP uses its own listing form for the store description)." />
                      <div className="row2">
                        <Field label="Publisher" value={details.copyright.publisher} onChange={(v) => edit((d) => void (d.copyright.publisher = v))} hint="Also printed on the copyright page." />
                        <Field label="ISBN" value={details.copyright.isbn} onChange={(v) => edit((d) => void (d.copyright.isbn = v))} hint="Also printed on the copyright page." />
                      </div>
                      <div className="row2">
                        <NumberField label="Font size" unit="pt" min={8} max={20} step={0.5} value={e.epub.fontSize} onChange={(v) => edit((d) => void (d.export.epub.fontSize = v))} />
                        <Toggle label="Drop cap on the first paragraph of each chapter" checked={e.epub.dropCaps} onChange={(v) => edit((d) => void (d.export.epub.dropCaps = v))} />
                      </div>
                      <div className="field">
                        <span className="field-label">Cover image (optional, JPEG or PNG)</span>
                        <div className="inline">
                          <button
                            type="button"
                            onClick={async () => {
                              const p = await window.mdedit.pickCoverImage();
                              if (p) edit((d) => void (d.export.epub.coverImage = p));
                            }}
                          >
                            Choose image…
                          </button>
                          {e.epub.coverImage ? (
                            <>
                              <code className="path">{e.epub.coverImage}</code>
                              <button type="button" onClick={() => edit((d) => void (d.export.epub.coverImage = ''))}>
                                Remove
                              </button>
                            </>
                          ) : (
                            <span className="muted">None (KDP takes the cover as a separate upload)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {e.outputs[k] && k === 'pdf' && (
                    <div className="output-panel">
                      <div className="row2">
                        <Select label="Trim size" value={e.pdf.trim} options={TRIM_OPTIONS} onChange={(v) => edit((d) => void (d.export.pdf.trim = v))} hint="KDP paperback sizes, from 5 × 8 in." />
                        <Select label="Paragraphs" value={e.pdf.paragraphStyle} options={PSTYLE} onChange={(v) => edit((d) => void (d.export.pdf.paragraphStyle = v))} />
                      </div>
                      <div className="row3">
                        <Select
                          label="Inside (gutter) margin"
                          value={e.pdf.gutter === 'auto' ? 'auto' : 'manual'}
                          options={[{ value: 'auto', label: 'Automatic (KDP table)' }, { value: 'manual', label: 'Set manually' }]}
                          onChange={(v) => edit((d) => void (d.export.pdf.gutter = v === 'auto' ? 'auto' : 0.5))}
                        />
                        {e.pdf.gutter !== 'auto' && (
                          <NumberField label="Gutter" unit="in" min={0.25} max={2} value={e.pdf.gutter} onChange={(v) => edit((d) => void (d.export.pdf.gutter = v))} hint="KDP: 0.375–0.875 by page count" />
                        )}
                        <NumberField label="Outside margin" unit="in" min={0.25} max={2} value={e.pdf.outerMargin} onChange={(v) => edit((d) => void (d.export.pdf.outerMargin = v))} />
                      </div>
                      <div className="row3">
                        <NumberField label="Top margin" unit="in" min={0.25} max={2} value={e.pdf.topMargin} onChange={(v) => edit((d) => void (d.export.pdf.topMargin = v))} />
                        <NumberField label="Bottom margin" unit="in" min={0.25} max={2} value={e.pdf.bottomMargin} onChange={(v) => edit((d) => void (d.export.pdf.bottomMargin = v))} />
                        <NumberField label="Font size" unit="pt" min={8} max={16} step={0.5} value={e.pdf.fontSize} onChange={(v) => edit((d) => void (d.export.pdf.fontSize = v))} />
                      </div>
                      <div className="row2">
                        <Select
                          label="Running head"
                          value={e.pdf.runningHead}
                          options={[
                            { value: 'none', label: 'None' },
                            { value: 'author', label: 'Author name on every page' },
                            { value: 'title', label: 'Book title on every page' },
                            { value: 'authorTitle', label: 'Author on left pages, title on right' }
                          ]}
                          onChange={(v) => edit((d) => void (d.export.pdf.runningHead = v))}
                        />
                        <div>
                          <Toggle label="Chapters start on a right-hand page" checked={e.pdf.rectoStarts} onChange={(v) => edit((d) => void (d.export.pdf.rectoStarts = v))} />
                          <Toggle label="Page numbers" checked={e.pdf.pageNumbers} onChange={(v) => edit((d) => void (d.export.pdf.pageNumbers = v))} />
                        </div>
                      </div>
                    </div>
                  )}
                  {e.outputs[k] && k === 'docx' && (
                    <div className="output-panel">
                      <div className="row3">
                        <Select label="Page size" value={e.docx.trim} options={TRIM_OPTIONS} onChange={(v) => edit((d) => void (d.export.docx.trim = v))} />
                        <Select label="Paragraphs" value={e.docx.paragraphStyle} options={PSTYLE} onChange={(v) => edit((d) => void (d.export.docx.paragraphStyle = v))} />
                        <NumberField label="Font size" unit="pt" min={8} max={20} step={0.5} value={e.docx.fontSize} onChange={(v) => edit((d) => void (d.export.docx.fontSize = v))} />
                      </div>
                      <p className="muted small">The contents list is linked but has no page numbers (pages can’t be measured without Word). Blank lines use non-breaking spaces so importers keep them.</p>
                    </div>
                  )}
                </div>
              ))}
            </section>

            <section>
              <h4>Text</h4>
              <div className="row2">
                <Select
                  label="Chapter headings"
                  value={e.chapterHeading}
                  options={[
                    { value: 'verbatim', label: 'Exactly as I wrote them' },
                    { value: 'numberWord', label: 'Number words (Chapter Twelve: Title)' }
                  ]}
                  onChange={(v) => edit((d) => void (d.export.chapterHeading = v))}
                  hint="“Chapter 12: Title” becomes “Chapter Twelve:” plus an italic title."
                />
                <Select
                  label="Typographic (curly) quotes"
                  value={e.smartQuotes}
                  options={[
                    { value: 'auto', label: 'Automatic' },
                    { value: 'always', label: 'Always convert' },
                    { value: 'never', label: 'Never convert' }
                  ]}
                  onChange={(v) => edit((d) => void (d.export.smartQuotes = v))}
                  hint="Automatic converts only if your text has straight quotes."
                />
              </div>
              <Field label="Scene-break symbol" value={e.sceneBreak} width={220} onChange={(v) => edit((d) => void (d.export.sceneBreak = v))} hint="Shown centred where your file has * * * or ---" />
            </section>

            <section>
              <h4>Chapters</h4>
              <div className="inline">
                <button type="button" onClick={() => edit((d) => void (d.export.excludedChapters = []))}>
                  Include all
                </button>
                <button type="button" onClick={() => edit((d) => void (d.export.excludedChapters = chapters.map((c) => c.title)))}>
                  Exclude all
                </button>
                <span className="muted small">
                  {chapters.length - e.excludedChapters.filter((t) => chapters.some((c) => c.title === t)).length} of {chapters.length} included
                </span>
              </div>
              <div className="chapter-list" role="group" aria-label="Chapters to include">
                {chapters.map((c, i) => (
                  <label className="toggle" key={`${i}-${c.title}`}>
                    <input type="checkbox" checked={included(c.title)} onChange={(ev) => setIncluded(c.title, ev.target.checked)} />
                    <span>
                      {c.title || '(untitled)'} <span className="muted small">· {c.words.toLocaleString()} words</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h4>Save to</h4>
              <div className="inline">
                <input
                  className="grow"
                  aria-label="Output folder"
                  value={e.outputDir}
                  onChange={(ev) => edit((d) => void (d.export.outputDir = ev.target.value))}
                />
                <button
                  type="button"
                  onClick={async () => {
                    const p = await window.mdedit.pickFolder();
                    if (p) edit((d) => void (d.export.outputDir = p));
                  }}
                >
                  Browse…
                </button>
              </div>
              <p className="muted small">A relative name is created beside the manuscript.</p>
              {plan && plan.outputs.length > 0 && (
                <ul className="plan" aria-label="Files that will be written">
                  {plan.outputs.map((o) => (
                    <li key={o.kind}>
                      <code className="path">{o.path}</code> {o.exists && <span className="warn-text">(replaces the existing file)</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {problems.length > 0 && (
              <div className="banner error" role="alert">
                {problems.map((p) => (
                  <div key={p}>{p}</div>
                ))}
              </div>
            )}
            {error && <div className="banner error">{error}</div>}
          </div>
        )}

        {phase === 'running' && (
          <div className="dialog-body" aria-live="polite">
            <p>Exporting <strong>{details.title}</strong>…</p>
            <ul className="progress-list">
              {progress.slice(-8).map((p, i, arr) => (
                <li key={i} className={i === arr.length - 1 ? 'now' : 'done'}>
                  {p.message}
                </li>
              ))}
              {progress.length === 0 && <li className="now">Starting…</li>}
            </ul>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="dialog-body" aria-live="polite">
            <div className={'banner ' + (result.ok ? 'info' : 'warn')} role="status">
              {result.ok ? `Done — ${result.outputs.length} file${result.outputs.length === 1 ? '' : 's'} created.` : 'The export finished with problems.'}
            </div>
            {result.outputs.length > 0 && (
              <ul className="results">
                {result.outputs.map((o) => (
                  <li key={o.kind}>
                    <div>
                      <strong>{basename(o.path)}</strong>
                      <span className="muted small">
                        {' '}
                        · {formatBytes(o.bytes)}
                        {o.pages ? ` · ${o.pages} pages · ${o.gutter} in inside margin` : ''}
                      </span>
                      <div className="muted small path">{o.path}</div>
                      {o.warnings.map((w) => (
                        <div key={w} className="warn-text small">
                          ⚠ {w}
                        </div>
                      ))}
                    </div>
                    <div className="inline">
                      <button type="button" onClick={() => void window.mdedit.openOutput(o.path)}>
                        Open
                      </button>
                      <button type="button" onClick={() => window.mdedit.revealOutput(o.path)}>
                        Show in folder
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {result.errors.length > 0 && (
              <div className="banner error" role="alert">
                {result.errors.map((m) => (
                  <div key={m}>{m}</div>
                ))}
              </div>
            )}
            {result.warnings.length > 0 && (
              <>
                <h5>Notes about your manuscript</h5>
                <ul className="notes">
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </>
            )}
            <p className="muted small">The EPUB passes the built-in structure check; run it through Kindle Previewer / KDP’s uploader to confirm KDP is happy.</p>
          </div>
        )}

        <div className="modal-actions">
          {phase === 'form' && !askDirty && (
            <>
              <button type="button" onClick={() => void closeAndSave()}>
                Close
              </button>
              <button type="button" className="primary" disabled={problems.length > 0 || !confirmed} onClick={onExportClick} title={!confirmed ? 'Confirm the title, subtitle and author first' : undefined}>
                Export
              </button>
            </>
          )}
          {phase === 'form' && askDirty && (
            <div className="confirm-row" key="dirty">
              <span className="muted">{basename(file)} has unsaved changes.</span>
              <button type="button" onClick={() => setAskDirty(false)}>
                Cancel
              </button>
              <button type="button" onClick={() => void startExport(false)}>
                Export saved version
              </button>
              <button type="button" className="primary" onClick={() => void startExport(true)}>
                Save and export
              </button>
            </div>
          )}
          {phase === 'running' && (
            <button type="button" onClick={() => window.mdedit.cancelExport()}>
              Cancel export
            </button>
          )}
          {phase === 'done' && (
            <>
              <button type="button" onClick={() => setPhase('form')}>
                Back to settings
              </button>
              <button type="button" className="primary" onClick={onClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
