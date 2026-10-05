import { useCallback, useState } from 'react';
import type { DirNode } from '../shared/api';
import { splitChapters, type MarkdownDoc } from '../shared/chapters';
import { chapterLabel, Tree, type Selection } from './Tree';
import './styles.css';

export function App() {
  const [root, setRoot] = useState<DirNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [docs, setDocs] = useState<Map<string, MarkdownDoc>>(new Map());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openFolder = useCallback(async () => {
    try {
      const folder = await window.mdedit.pickFolder();
      if (!folder) return;
      setRoot(await window.mdedit.scanFolder(folder));
      setExpanded(new Set());
      setDocs(new Map());
      setSelection(null);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

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
                onSelect={setSelection}
              />
            )}
          </>
        ) : (
          <p className="muted pad">Pick a folder to browse its Markdown files.</p>
        )}
      </aside>
      <main className="content">
        {error && <div className="error">{error}</div>}
        {chapter ? (
          <>
            <h2>{chapterLabel(chapter)}</h2>
            <pre className="preview">{chapter.raw}</pre>
          </>
        ) : (
          <p className="muted">Select a chapter to view it. (Editing arrives in the next milestone.)</p>
        )}
      </main>
    </div>
  );
}
