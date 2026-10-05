import { useCallback, useEffect, useRef, useState } from 'react';
import type { DirNode } from '../shared/api';
import { joinChapters, splitChapters, updateChapter, type MarkdownDoc } from '../shared/chapters';
import { Editor } from './Editor';
import { chapterLabel, Tree, type Selection } from './Tree';
import './styles.css';

export function App() {
  const [root, setRoot] = useState<DirNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [docs, setDocs] = useState<Map<string, MarkdownDoc>>(new Map());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Unsaved editor output for the open chapter, or null when it is unchanged.
  const [draft, setDraft] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState(0);
  const saving = useRef(false);

  const dirty = draft !== null;

  /**
   * Gate for anything that would leave the open chapter (switch chapter/file, change folder).
   * Milestone 5 replaces this with a Save / Don't Save / Cancel dialog.
   */
  const confirmLeave = useCallback(
    () => !dirty || window.confirm('You have unsaved changes. Discard them?'),
    [dirty]
  );

  const save = useCallback(async () => {
    if (!selection || draft === null || saving.current) return;
    const doc = docs.get(selection.file);
    if (!doc) return;
    saving.current = true;
    try {
      const text = joinChapters(updateChapter(doc, selection.chapter, draft));
      await window.mdedit.writeFile(selection.file, text);
      // Re-split: the user may have added or removed a Heading 1.
      setDocs((prev) => new Map(prev).set(selection.file, splitChapters(text)));
      setDraft(null);
      setSavedVersion((v) => v + 1);
      setError(null);
    } catch (e) {
      setError(`Could not save: ${e}`);
    } finally {
      saving.current = false;
    }
  }, [selection, draft, docs]);

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

  const selectChapter = useCallback(
    (sel: Selection) => {
      if (sel.file === selection?.file && sel.chapter === selection.chapter) return;
      if (!confirmLeave()) return;
      setDraft(null);
      setSelection(sel);
    },
    [selection, confirmLeave]
  );

  const openFolder = useCallback(async () => {
    if (!confirmLeave()) return;
    try {
      const folder = await window.mdedit.pickFolder();
      if (!folder) return;
      setRoot(await window.mdedit.scanFolder(folder));
      setExpanded(new Set());
      setDocs(new Map());
      setSelection(null);
      setDraft(null);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [confirmLeave]);

  const toggle = useCallback(
    async (path: string, isFile: boolean) => {
      const wasOpen = expanded.has(path);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (wasOpen) next.delete(path);
        else next.add(path);
        return next;
      });
      if (isFile && !wasOpen && !docs.has(path)) {
        try {
          const text = await window.mdedit.readFile(path);
          setDocs((prev) => new Map(prev).set(path, splitChapters(text)));
        } catch (e) {
          setError(String(e));
        }
      }
    },
    [expanded, docs]
  );

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
        {error && <div className="error">{error}</div>}
        {chapter && selection ? (
          <>
            <div className="editor-head">
              <h2>
                {chapterLabel(chapter)}
                {dirty && <span className="dirty" title="Unsaved changes"> ●</span>}
              </h2>
              <button onClick={save} disabled={!dirty}>Save (Ctrl+S)</button>
            </div>
            <Editor
              key={`${selection.file}#${selection.chapter}`}
              initial={chapter.raw}
              onChange={setDraft}
              savedVersion={savedVersion}
            />
          </>
        ) : (
          <p className="muted">Select a chapter to edit it.</p>
        )}
      </main>
    </div>
  );
}
