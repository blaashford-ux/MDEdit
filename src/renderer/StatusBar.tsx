interface Props {
  chapterIndex: number;
  chapterCount: number;
  words: number;
  dirty: boolean;
  autosaved: boolean;
  eol: '\n' | '\r\n';
  mode: 'visual' | 'source';
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
      <span>{p.mode === 'source' ? 'Source' : 'Visual'}</span>
      <span>{p.eol === '\r\n' ? 'CRLF' : 'LF'}</span>
    </footer>
  );
}
