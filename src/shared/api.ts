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
export type MenuAction = 'change-folder' | 'refresh' | 'save';

export type UnsavedChoice = 'save' | 'discard' | 'cancel';

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

  /** Native "Do you want to save changes?" dialog. */
  confirmUnsaved(fileName: string): Promise<UnsavedChoice>;
  /** Native "file changed on disk, overwrite?" dialog. */
  confirmOverwrite(fileName: string): Promise<boolean>;

  /** Tells the main process which file has unsaved edits (null = none) so closing can prompt. */
  setDirty(fileName: string | null): void;
  /** Main asks the renderer to save before the window closes. Returns an unsubscribe function. */
  onSaveBeforeClose(cb: () => void): () => void;
  reportSaveResult(ok: boolean): void;
  /** Native menu item clicked. Returns an unsubscribe function. */
  onMenuAction(cb: (action: MenuAction) => void): () => void;
}

declare global {
  interface Window {
    mdedit: MdeditApi;
  }
}
