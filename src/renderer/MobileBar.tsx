import logo from './logo.png';

interface Props {
  /** What is open, e.g. "Chapter 3 — book.md". */
  title: string;
  dirty: boolean;
  /** The file list can be opened (a project is open). */
  showFiles: boolean;
  onFiles(): void;
  /** Back to the Projects home (absent when already there). */
  onHome?(): void;
  onSave(): void;
  canSave: boolean;
}

/** The phone's top bar: file list, the open chapter, and Save (there are no menus or window buttons). */
export function MobileBar({ title, dirty, showFiles, onFiles, onHome, onSave, canSave }: Props) {
  return (
    <header className="mobilebar">
      {showFiles ? (
        <button type="button" className="mb-btn" aria-label="Files" onClick={onFiles}>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
        </button>
      ) : (
        <img className="tb-logo" src={logo} alt="" width={24} height={24} />
      )}
      <div className="mb-title" title={title}>
        {showFiles ? title : 'MDEdit'}
        {dirty && <span className="dirty" aria-label="unsaved changes"> ●</span>}
      </div>
      {onHome && (
        <button type="button" className="mb-btn text" onClick={onHome}>
          Projects
        </button>
      )}
      {showFiles && (
        <button type="button" className="mb-btn text primary" onClick={onSave} disabled={!canSave}>
          Save
        </button>
      )}
    </header>
  );
}
