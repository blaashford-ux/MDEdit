import { useEffect, useMemo, useState } from 'react';
import { buildFrontMatter, safeUrl } from '../shared/export/matter';
import type { BookDetails } from '../shared/export/model';
import { basename } from '../shared/paths';
import { Field, ListEditor, TextArea, Toggle } from './formParts';
import { useEscape } from './useEscape';

type Tab = 'title' | 'front' | 'back';

interface Props {
  file: string;
  onClose(): void;
  /** Called after a successful save. */
  onSaved?(): void;
}

const urlHint = (url: string) =>
  url.trim() && !safeUrl(url) ? <span className="bad">Only http(s) and mailto links are used — this one will be left out.</span> : null;

/** The Book Details form: title page, copyright page, optional front matter, and back matter. */
export function BookDetailsDialog({ file, onClose, onSaved }: Props) {
  const [details, setDetails] = useState<BookDetails | null>(null);
  const [initial, setInitial] = useState('');
  const [damaged, setDamaged] = useState(false);
  const [tab, setTab] = useState<Tab>('title');
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    window.mdedit
      .getBookDetails(file)
      .then((r) => {
        if (!live) return;
        setDetails(r.details);
        setInitial(JSON.stringify(r.details));
        setDamaged(r.damaged);
      })
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [file]);

  const dirty = details !== null && JSON.stringify(details) !== initial;
  const preview = useMemo(() => (details ? buildFrontMatter(details).find((p) => p.id === 'copyright') : undefined), [details]);

  const requestClose = () => (dirty ? setConfirmDiscard(true) : onClose());
  useEscape(() => (confirmDiscard ? setConfirmDiscard(false) : requestClose()));

  const save = async () => {
    if (!details || saving) return;
    setSaving(true);
    try {
      await window.mdedit.saveBookDetails(file, details);
      onSaved?.();
      onClose();
    } catch (e) {
      setError(`Could not save: ${e instanceof Error ? e.message : e}`);
      setSaving(false);
    }
  };

  if (!details) {
    return (
      <div className="modal-backdrop">
        <div className="modal wide" role="dialog" aria-label="Book Details">
          <h3>Book Details</h3>
          {error ? <div className="banner error">{error}</div> : <p className="muted">Loading…</p>}
          {error && (
            <div className="modal-actions">
              <button onClick={onClose}>Close</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const set = (patch: Partial<BookDetails>) => setDetails({ ...details, ...patch });
  const setCopyright = (patch: Partial<BookDetails['copyright']>) => set({ copyright: { ...details.copyright, ...patch } });
  const setBack = <K extends keyof BookDetails['back']>(k: K, patch: Partial<BookDetails['back'][K]>) =>
    set({ back: { ...details.back, [k]: { ...details.back[k], ...patch } } });
  const c = details.copyright;

  return (
    <div className="modal-backdrop">
      <form
        className="modal wide book-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Book Details"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h3>
          Book Details <span className="muted">— {basename(file)}</span>
        </h3>
        <div className="subtabs" role="tablist">
          {(
            [
              ['title', 'Title & copyright'],
              ['front', 'Front matter'],
              ['back', 'Back matter']
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>

        <div className="dialog-body">
          {damaged && (
            <div className="banner warn">
              The saved export settings for this file couldn’t be read, so these are fresh defaults. The old file is kept as a <code>.bak</code> when you save.
            </div>
          )}
          {error && <div className="banner error">{error}</div>}

          {tab === 'title' && (
            <>
              <section>
                <h4>Title page</h4>
                <p className="muted small">Entered exactly as you type them — nothing is split, re-cased or guessed.</p>
                <Field label="Title" required value={details.title} onChange={(v) => set({ title: v })} />
                <Field label="Subtitle" value={details.subtitle} onChange={(v) => set({ subtitle: v })} hint="Optional. Shown in italics under the title." />
                <Field label="Author / pen name" required value={details.author} onChange={(v) => set({ author: v })} />
              </section>
              <section>
                <h4>Copyright page</h4>
                <div className="row2">
                  <Field label="Copyright year" value={c.year} width={140} onChange={(v) => setCopyright({ year: v })} />
                  <Field label="Edition line" value={c.edition} onChange={(v) => setCopyright({ edition: v })} hint="Leave blank to omit." />
                </div>
                <div className="row2">
                  <Field label="Publisher" value={c.publisher} onChange={(v) => setCopyright({ publisher: v })} hint="Optional." />
                  <Field label="ISBN" value={c.isbn} onChange={(v) => setCopyright({ isbn: v })} hint="Optional." />
                </div>
                <Toggle label="Fiction disclaimer" checked={c.fictionDisclaimer} onChange={(v) => setCopyright({ fictionDisclaimer: v })} />
                {c.fictionDisclaimer && <TextArea label="Wording" rows={3} value={c.fictionText} onChange={(v) => setCopyright({ fictionText: v })} />}
                <TextArea label="Reproduction-rights paragraph" rows={3} value={c.reproductionText} onChange={(v) => setCopyright({ reproductionText: v })} hint="Leave blank to omit." />
                <Toggle label="Mature-content notice (18+)" checked={c.matureNotice} onChange={(v) => setCopyright({ matureNotice: v })} />
                {c.matureNotice && <TextArea label="Wording" rows={2} value={c.matureText} onChange={(v) => setCopyright({ matureText: v })} />}
                <Toggle label="AI disclosure" checked={c.aiDisclosure} onChange={(v) => setCopyright({ aiDisclosure: v })} />
                {c.aiDisclosure && <TextArea label="Wording" rows={2} value={c.aiText} onChange={(v) => setCopyright({ aiText: v })} />}
                <h5>Extra lines</h5>
                <ListEditor
                  items={c.extraLines}
                  onChange={(extraLines) => setCopyright({ extraLines })}
                  blank={() => ''}
                  addLabel="Add a line"
                  row={(line, update) => <input aria-label="Extra line" value={line} onChange={(e) => update(e.target.value)} />}
                />
                <div className="preview-box" aria-label="Copyright page preview">
                  <div className="preview-title">Copyright page preview</div>
                  {preview?.blocks.map((b, i) => (
                    <p key={i} className={b.t === 'para' && b.bold ? 'bold' : ''}>
                      {'text' in b ? b.text : ''}
                    </p>
                  ))}
                </div>
              </section>
            </>
          )}

          {tab === 'front' && (
            <>
              <section>
                <h4>Dedication</h4>
                <Toggle label="Include a dedication page" checked={details.dedication.enabled} onChange={(v) => set({ dedication: { ...details.dedication, enabled: v } })} />
                {details.dedication.enabled && (
                  <TextArea label="Text" value={details.dedication.text} onChange={(v) => set({ dedication: { ...details.dedication, text: v } })} hint="Blank lines start a new paragraph." />
                )}
              </section>
              <section>
                <h4>Epigraph</h4>
                <Toggle label="Include an epigraph page" checked={details.epigraph.enabled} onChange={(v) => set({ epigraph: { ...details.epigraph, enabled: v } })} />
                {details.epigraph.enabled && (
                  <>
                    <TextArea label="Quotation" value={details.epigraph.text} onChange={(v) => set({ epigraph: { ...details.epigraph, text: v } })} />
                    <Field label="Attribution" value={details.epigraph.attribution} onChange={(v) => set({ epigraph: { ...details.epigraph, attribution: v } })} hint="Shown as “— Name”." />
                  </>
                )}
              </section>
            </>
          )}

          {tab === 'back' && (
            <>
              <p className="muted small">Each page starts on its own page after the last chapter. No link is ever added unless you type it here.</p>
              <section>
                <h4>Continue the story</h4>
                <Toggle label="Include this page" checked={details.back.links.enabled} onChange={(v) => setBack('links', { enabled: v })} />
                {details.back.links.enabled && (
                  <>
                    <Field label="Heading" value={details.back.links.heading} onChange={(v) => setBack('links', { heading: v })} />
                    <TextArea label="Text" rows={3} value={details.back.links.intro} onChange={(v) => setBack('links', { intro: v })} />
                    <ListEditor
                      items={details.back.links.items}
                      onChange={(items) => setBack('links', { items })}
                      blank={() => ({ label: '', url: '' })}
                      addLabel="Add a link"
                      row={(it, update) => (
                        <>
                          <input aria-label="Link label" placeholder="Label (e.g. Join my mailing list)" value={it.label} onChange={(e) => update({ ...it, label: e.target.value })} />
                          <input aria-label="Link address" placeholder="https://…" value={it.url} onChange={(e) => update({ ...it, url: e.target.value })} />
                          {urlHint(it.url)}
                        </>
                      )}
                    />
                  </>
                )}
              </section>
              <section>
                <h4>Also by the author</h4>
                <Toggle label="Include this page" checked={details.back.alsoBy.enabled} onChange={(v) => setBack('alsoBy', { enabled: v })} />
                {details.back.alsoBy.enabled && (
                  <>
                    <Field label="Heading" value={details.back.alsoBy.heading} placeholder={`ALSO BY ${details.author.toUpperCase() || 'AUTHOR'}`} onChange={(v) => setBack('alsoBy', { heading: v })} hint="Leave blank for the default shown." />
                    <ListEditor
                      items={details.back.alsoBy.items}
                      onChange={(items) => setBack('alsoBy', { items })}
                      blank={() => ({ title: '', url: '' })}
                      addLabel="Add a book"
                      row={(it, update) => (
                        <>
                          <input aria-label="Book title" placeholder="Book title" value={it.title} onChange={(e) => update({ ...it, title: e.target.value })} />
                          <input aria-label="Book link" placeholder="https://… (optional)" value={it.url} onChange={(e) => update({ ...it, url: e.target.value })} />
                          {urlHint(it.url)}
                        </>
                      )}
                    />
                  </>
                )}
              </section>
              <section>
                <h4>About the author</h4>
                <Toggle label="Include this page" checked={details.back.about.enabled} onChange={(v) => setBack('about', { enabled: v })} />
                {details.back.about.enabled && (
                  <>
                    <Field label="Heading" value={details.back.about.heading} onChange={(v) => setBack('about', { heading: v })} />
                    <TextArea label="Bio" value={details.back.about.text} onChange={(v) => setBack('about', { text: v })} />
                  </>
                )}
              </section>
              <section>
                <h4>Custom page</h4>
                <Toggle label="Include this page" checked={details.back.custom.enabled} onChange={(v) => setBack('custom', { enabled: v })} />
                {details.back.custom.enabled && (
                  <>
                    <Field label="Heading" value={details.back.custom.heading} onChange={(v) => setBack('custom', { heading: v })} hint="Optional. A heading also adds the page to the contents." />
                    <TextArea label="Text" value={details.back.custom.text} onChange={(v) => setBack('custom', { text: v })} />
                  </>
                )}
              </section>
            </>
          )}
        </div>

        <div className="modal-actions">
          {/* Separate keyed containers: React must never reuse the "Keep editing" button DOM node as the
              submit button mid-click, or that click would also submit (save) the form. */}
          {confirmDiscard ? (
            <div className="confirm-row" key="confirm">
              <span className="muted">Discard your changes?</span>
              <button type="button" onClick={() => setConfirmDiscard(false)}>
                Keep editing
              </button>
              <button type="button" className="danger" onClick={onClose}>
                Discard
              </button>
            </div>
          ) : (
            <div className="confirm-row" key="normal">
              <button type="button" onClick={requestClose}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={saving || !dirty}>
                Save
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
