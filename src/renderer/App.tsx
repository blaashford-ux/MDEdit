import { useCallback, useEffect, useRef, useState } from 'react';
import type { DirNode, FileStamp } from '../shared/api';
import {
  chapterBody,
  joinChapters,
  splitChapters,
  updateChapter,
  type MarkdownDoc
} from '../shared/chapters';
import { Editor } from './Editor';
import { guardLeave } from './leaveGuard';
import { chapterLabel, Tree, type Selection } from './Tree';
import './styles.css';

type Conflict =
  | { kind: 'changed'; file: string; text: string; stamp: FileStamp }
  | { kind: 'missing'; file: string };

const POLL_MS = 2000;
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const sameStamp = (a: FileStamp, b: FileStamp) => a.mtimeMs === b.mtimeMs && a.size === b.size;

export function App() {
  const [root, setRoot] = useState<DirNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [docs, setDocs] = useState<Map<string, MarkdownDoc>>(new Map());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  // Unsaved editor output for the open chapter, or null when it is unchanged.
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ version: number; markdown: string } | null>(null);
  // Bumped to remount the editor when the open chapter's content is replaced from outside.
  const [reloadKey, setReloadKey] = useState(0);

  // What each open file looked like on disk when we last read or wrote it.
  const stamps = useRef(new Map<string, FileStamp>());
  const saving = useRef(false);
  // Async handlers read these instead of stale closures.
  const latest = useRef({ docs, selection, draft, conflict });
  latest.current = { docs, selection, draft, conflict };

  const dirty = draft !== null;

  const applyDisk = useCallback((file: string, text: string, stamp: FileStamp) => {
    const doc = splitChapters(text);
    stamps.current.set(file, stamp);
    setDocs((prev) => new Map(prev).set(file, doc));
    setSelection((s) =>
      s && s.file === file ? { file, chapter: Math.min(s.chapter, doc.chapters.length - 1) } : s
    );
    setDraft(null);
    setConflict(null);
    setReloadKey((k) => k + 1);
  }, []);

  /** Reads a file into the cache; keeps the existing doc object if nothing changed. */
  const refreshDoc = useCallback(async (file: string) => {
    const { text, stamp } = await window.mdedit.readFile(file);
    stamps.current.set(file, stamp);
    const existing = latest.current.docs.get(file);
    if (!existing || joinChapters(existing) !== text) {
      setDocs((prev) => new Map(prev).set(file, splitChapters(text)));
    }
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    const { selection: sel, draft: text, docs: all } = latest.current;
    if (!sel || text === null) return true; // nothing to save
    const doc = all.get(sel.file);
    if (!doc || saving.current) return false;
    saving.current = true;
    try {
      // Never silently clobber an edit made outside the app.
      const known = stamps.current.get(sel.file);
      const now = await window.mdedit.statFile(sel.file);
      if (known && now && !sameStamp(known, now)) {
        const onDisk = (await window.mdedit.readFile(sel.file)).text;
        if (onDisk !== joinChapters(doc) && !(await window.mdedit.confirmOverwrite(baseName(sel.file)))) {
          return false;
        }
      }
      const updated = updateChapter(doc, sel.chapter, text);
      const stamp = await window.mdedit.writeFile(sel.file, joinChapters(updated));
      stamps.current.set(sel.file, stamp);
      const fresh = splitChapters(joinChapters(updated));
      setDocs((prev) => new Map(prev).set(sel.file, fresh));
      setSaved((s) => ({ version: (s?.version ?? 0) + 1, markdown: text }));
      setConflict(null);
      setError(null);
      // If the edit added/removed a Heading 1, the editor no longer matches one chapter: reload it.
      const idx = Math.min(sel.chapter, fresh.chapters.length - 1);
      if (chapterBody(fresh.chapters[idx].raw) !== chapterBody(text)) {
        setSelection({ file: sel.file, chapter: idx });
        setDraft(null);
        setReloadKey((k) => k + 1);
      }
      return true;
    } catch (e) {
      setError(`Could not save: ${e}`);
      return false;
    } finally {
      saving.current = false;
    }
  }, []);

  /** Gate for anything that would leave the open chapter. */
  const confirmLeave = useCallback(() => {
    const file = latest.current.selection?.file ?? '';
    return guardLeave(
      latest.current.draft !== null,
      () => window.mdedit.confirmUnsaved(baseName(file)),
      save
    );
  }, [save]);

  const openPath = useCallback(async (folder: string) => {
    setRoot(await window.mdedit.scanFolder(folder));
    stamps.current.clear();
    setExpanded(new Set());
    setDocs(new Map());
    setSelection(null);
    setDraft(null);
    setConflict(null);
    setNotice(null);
    setError(null);
  }, []);

  const openFolder = useCallback(async () => {
    if (!(await confirmLeave())) return;
    try {
      const folder = await window.mdedit.pickFolder();
      if (folder) await openPath(folder);
    } catch (e) {
      setError(String(e));
    }
  }, [confirmLeave, openPath]);

  // Reopen the last folder on startup.
  useEffect(() => {
    void window.mdedit
      .getLastFolder()
      .then(async (folder) => {
        if (folder) await openPath(folder);
      })
      .catch(() => undefined);
  }, [openPath]);

  const toggle = useCallback(
    async (path: string, isFile: boolean) => {
      const wasOpen = expanded.has(path);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (wasOpen) next.delete(path);
        else next.add(path);
        return next;
      });
      if (isFile && !wasOpen) {
        try {
          // Re-read on expand so the chapter list is never stale.
          if (!(dirty && selection?.file === path)) await refreshDoc(path);
        } catch (e) {
          setError(String(e));
        }
      }
    },
    [expanded, dirty, selection, refreshDoc]
  );

  const selectChapter = useCallback(
    async (sel: Selection) => {
      const cur = latest.current.selection;
      if (cur && cur.file === sel.file && cur.chapter === sel.chapter) return;
      if (!(await confirmLeave())) return;
      try {
        if (sel.file !== cur?.file) await refreshDoc(sel.file);
      } catch (e) {
        setError(String(e));
        return;
      }
      setDraft(null);
      setConflict(null);
      setNotice(null);
      setSelection(sel);
    },
    [confirmLeave, refreshDoc]
  );

  // Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  // Let the main process prompt on window close, and save when the user picks "Save".
  useEffect(() => {
    window.mdedit.setDirty(dirty && selection ? baseName(selection.file) : null);
  }, [dirty, selection]);
  useEffect(
    () =>
      window.mdedit.onSaveBeforeClose(() => {
        void save().then((ok) => window.mdedit.reportSaveResult(ok));
      }),
    [save]
  );

  // Notice edits made outside the app (Dropbox sync, another editor, git checkout...).
  const openFile = selection?.file;
  useEffect(() => {
    if (!openFile) return;
    let busy = false;
    const check = async () => {
      if (busy || saving.current) return;
      busy = true;
      try {
        const known = stamps.current.get(openFile);
        const now = await window.mdedit.statFile(openFile);
        if (!now) {
          if (known) {
            stamps.current.delete(openFile);
            setConflict({ kind: 'missing', file: openFile });
          }
          return;
        }
        if (known && sameStamp(known, now)) return;
        const pending = latest.current.conflict;
        if (pending?.kind === 'changed' && pending.file === openFile && sameStamp(pending.stamp, now)) return;

        const { text, stamp } = await window.mdedit.readFile(openFile);
        const doc = latest.current.docs.get(openFile);
        if (doc && joinChapters(doc) === text) {
          stamps.current.set(openFile, stamp); // touched, content identical
          setConflict((c) => (c?.file === openFile && c.kind === 'missing' ? null : c));
        } else if (latest.current.draft === null) {
          applyDisk(openFile, text, stamp);
          setNotice(`${baseName(openFile)} changed on disk and was reloaded.`);
        } else {
          setConflict({ kind: 'changed', file: openFile, text, stamp });
        }
      } catch {
        // transient read error (file mid-write): try again next tick
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void check(), POLL_MS);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [openFile, applyDisk]);

  const chapter = selection ? docs.get(selection.file)?.chapters[selection.chapter] : undefined;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="toolbar">
          <button onClick={openFolder}>Open Folder…</button>
        </div>
        {root ? (
          <>
            <div className="root-name" title={root.path}>{root.name}</div>
            {root.children.length === 0 ? (
              <p className="muted pad">No Markdown files found.</p>
            ) : (
              <Tree
                root={root}
                expanded={expanded}
                docs={docs}
                selection={selection}
                onToggle={toggle}
                onSelect={selectChapter}
              />
            )}
          </>
        ) : (
          <p className="muted pad">Pick a folder to browse its Markdown files.</p>
        )}
      </aside>
      <main className="content">
        {error && <div className="banner error" role="alert">{error}</div>}
        {notice && (
          <div className="banner info" role="status">
            {notice} <button onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        )}
        {conflict?.kind === 'changed' && (
          <div className="banner warn" role="alert">
            {baseName(conflict.file)} was changed on disk while you have unsaved edits.{' '}
            <button onClick={() => applyDisk(conflict.file, conflict.text, conflict.stamp)}>
              Reload from disk (discard my edits)
            </button>{' '}
            <button
              onClick={() => {
                stamps.current.set(conflict.file, conflict.stamp);
                setConflict(null);
              }}
            >
              Keep my version
            </button>
          </div>
        )}
        {conflict?.kind === 'missing' && (
          <div className="banner warn" role="alert">
            {baseName(conflict.file)} was deleted or moved. Saving will recreate it.{' '}
            <button onClick={() => setConflict(null)}>Dismiss</button>
          </div>
        )}
        {chapter && selection ? (
          <>
            <div className="editor-head">
              <h2>
                {chapterLabel(chapter)}
                {dirty && <span className="dirty" title="Unsaved changes"> ●</span>}
              </h2>
              <button onClick={() => void save()} disabled={!dirty}>Save (Ctrl+S)</button>
            </div>
            <Editor
              key={`${selection.file}#${selection.chapter}@${reloadKey}`}
              initial={chapter.raw}
              onChange={setDraft}
              saved={saved}
            />
          </>
        ) : (
          <p className="muted">Select a chapter to edit it.</p>
        )}
      </main>
    </div>
  );
}
