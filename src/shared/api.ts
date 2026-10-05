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

export interface MdeditApi {
  /** Shows the OS folder picker. Resolves to the chosen folder or null if cancelled. */
  pickFolder(): Promise<string | null>;
  /** Scans a folder recursively for Markdown files. Empty branches are omitted. */
  scanFolder(root: string): Promise<DirNode>;
  readFile(path: string): Promise<string>;
  /** Atomically overwrites a Markdown file inside the opened folder. */
  writeFile(path: string, content: string): Promise<void>;
}

declare global {
  interface Window {
    mdedit: MdeditApi;
  }
}
