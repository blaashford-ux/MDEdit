interface Props {
  chapterIndex: number;
  chapterCount: number;
  words: number;
  dirty: boolean;
  autosaved: boolean;
  eol: '\n' | '\r\n';
  mode: 'visual' | 'source';
  /** The action Undo would reverse (null when there is none), how many are stacked, and what Redo would re-apply. */
  undoLabel: string | null;
  undoCount: number;
  redoLabel: string | null;
  onUndo(): void;
  onRedo(): void;
}

export function StatusBar(p: Props) {
  return (
    <footer className="statusbar" role="status">
      <span>
        Chapter {p.chapterIndex + 1} of {p.chapterCount}
      </span>
      <span>{p.words.toLocaleString()} {p.words === 1 ? 'word' : 'words'}</span>
      <span className={p.dirty ? 'unsaved' : ''}>
        {p.dirty ? (p.autosaved ? 'Unsaved changes · draft autosaved' : 'Unsaved changes') : 'All changes saved'}
      </span>
      <span className="spacer" />
      {p.undoLabel && (
        <button type="button" className="sb-undo" onClick={p.onUndo} title={`Undo: ${p.undoLabel} (Ctrl+Alt+Z)${p.undoCount > 1 ? ` — ${p.undoCount} steps available` : ''}`}>
          Undo{p.undoCount > 1 ? ` (${p.undoCount})` : ''}: {p.undoLabel}
        </button>
      )}
      {p.redoLabel && (
        <button type="button" className="sb-undo" onClick={p.onRedo} title={`Redo: ${p.redoLabel} (Ctrl+Alt+Y)`}>
          Redo
        </button>
      )}
      <span>{p.mode === 'source' ? 'Source' : 'Visual'}</span>
      <span>{p.eol === '\r\n' ? 'CRLF' : 'LF'}</span>
    </footer>
  );
}
