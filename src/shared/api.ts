export interface FileNode {
  kind: 'file';
  name: string;
  path: string;
}

export interface DirNode {
  kind: 'dir';
  name: string;
  path: string;
  children: TreeNode[];
}

export type TreeNode = FileNode | DirNode;

/** Cheap fingerprint of a file on disk, used to notice external changes. */
export interface FileStamp {
  mtimeMs: number;
  size: number;
}

/** Commands the native application menu can trigger in the renderer. */
export type MenuAction =
  | 'change-folder'
  | 'refresh'
  | 'save'
  | 'new-file'
  | 'close-tab'
  | 'next-tab'
  | 'prev-tab'
  | 'next-chapter'
  | 'prev-chapter';

export type UnsavedChoice = 'save' | 'discard' | 'cancel';
export type ThemeSource = 'system' | 'light' | 'dark';
export type EditorMode = 'visual' | 'source';

/** Which tabs were open in a folder, so the app can put you back where you were. */
export interface Session {
  tabs: { file: string; chapter: number; mode: EditorMode }[];
  active: string | null;
  expanded: string[];
}

export interface Prefs {
  sidebarWidth?: number;
}

/** Unsaved text autosaved for crash recovery. One per file (the open chapter's edits). */
export interface DraftRecord {
  file: string;
  chapter: number;
  title: string;
  markdown: string;
  updatedAt: number;
}

export interface MdeditApi {
  /** Shows the OS folder picker. Resolves to the chosen folder or null if cancelled. */
  pickFolder(): Promise<string | null>;
  /** The folder open when the app was last used, if it still exists. */
  getLastFolder(): Promise<string | null>;
  /** Scans a folder recursively for Markdown files and remembers it as the last folder. */
  scanFolder(root: string): Promise<DirNode>;
  readFile(path: string): Promise<{ text: string; stamp: FileStamp }>;
  /** Null when the file no longer exists. */
  statFile(path: string): Promise<FileStamp | null>;
  /** Atomically overwrites a Markdown file inside the opened folder. */
  writeFile(path: string, content: string): Promise<FileStamp>;

  /** New Markdown file in `dir` (".md" is added if missing). Fails if it exists. Returns its path. */
  createFile(dir: string, name: string, content?: string): Promise<string>;
  /** Renames within the same folder. Returns the new path. */
  renameNode(path: string, newName: string): Promise<string>;
  /** Moves to the Recycle Bin. */
  trashNode(path: string): Promise<void>;
  /** Shows the item in File Explorer. */
  reveal(path: string): void;

  getPrefs(): Promise<Prefs>;
  setPrefs(patch: Partial<Prefs>): void;
  getSession(folder: string): Promise<Session | null>;
  saveSession(folder: string, session: Session): void;

  saveDraft(draft: DraftRecord): Promise<void>;
  clearDraft(file: string): Promise<void>;
  listDrafts(): Promise<DraftRecord[]>;

  /** Native "Do you want to save changes?" dialog. */
  confirmUnsaved(fileName: string): Promise<UnsavedChoice>;
  /** Native "file changed on disk, overwrite?" dialog. */
  confirmOverwrite(fileName: string): Promise<boolean>;
  confirmDelete(name: string, kind: 'file' | 'folder' | 'chapter', hasUnsaved: boolean): Promise<boolean>;
  confirmRecover(fileName: string): Promise<boolean>;

  /** Tells the main process which files have unsaved edits so closing the window can ask first. */
  setDirtyFiles(fileNames: string[]): void;
  /** Main asks the renderer to resolve unsaved tabs before the window closes. */
  onCloseRequested(cb: () => void): () => void;
  /** true = all tabs resolved, go ahead and close; false = the user cancelled. */
  reportCloseDecision(ok: boolean): void;
  /** Native menu item clicked. Returns an unsubscribe function. */
  onMenuAction(cb: (action: MenuAction) => void): () => void;
}

declare global {
  interface Window {
    mdedit: MdeditApi;
  }
}
