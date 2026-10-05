import type {
  DirNode,
  DraftRecord,
  FileStamp,
  MdeditApi,
  MenuAction,
  Prefs,
  Session,
  TreeNode,
  UnsavedChoice
} from '../../shared/api';
import { basename, dirname, isInside } from '../../shared/paths';

/** In-memory stand-in for the Electron bridge, with scripted dialog answers. */
export class FakeApi implements MdeditApi {
  files = new Map<string, { text: string; mtime: number }>();
  clock = 1;
  lastFolder: string | null = null;
  prefs: Prefs = {};
  sessions = new Map<string, Session>();
  drafts = new Map<string, DraftRecord>();
  trashed: string[] = [];
  revealed: string[] = [];
  dirtyReports: string[][] = [];
  writes: string[] = [];
  scans = 0;

  /** Scripted answers, consumed in order. Defaults: unsaved→cancel, others→true. */
  unsavedAnswers: UnsavedChoice[] = [];
  overwriteAnswers: boolean[] = [];
  deleteAnswers: boolean[] = [];
  recoverAnswers: boolean[] = [];
  unsavedAsked: string[] = [];
  pickResult: string | null = null;
  failTrash = false;

  constructor(public root = '/proj') {}

  add(rel: string, text: string): void {
    this.files.set(`${this.root}/${rel}`, { text, mtime: this.clock++ });
  }
  /** Simulates another program editing the file. */
  external(path: string, text: string): void {
    this.files.set(path, { text, mtime: this.clock++ });
  }
  text(path: string): string | undefined {
    return this.files.get(path)?.text;
  }
  private stampOf(path: string): FileStamp | null {
    const f = this.files.get(path);
    return f ? { mtimeMs: f.mtime, size: f.text.length } : null;
  }

  private buildTree(dir: string): DirNode {
    const dirs = new Set<string>();
    const nodes: TreeNode[] = [];
    for (const p of [...this.files.keys()].sort()) {
      if (!isInside(p, dir) || p === dir) continue;
      const rest = p.slice(dir.length + 1);
      const slash = rest.indexOf('/');
      if (slash < 0) nodes.push({ kind: 'file', name: rest, path: p });
      else dirs.add(rest.slice(0, slash));
    }
    const dirNodes = [...dirs].sort().map((d) => this.buildTree(`${dir}/${d}`));
    return { kind: 'dir', name: basename(dir), path: dir, children: [...dirNodes, ...nodes] };
  }

  pickFolder = async () => this.pickResult;
  getLastFolder = async () => this.lastFolder;
  scanFolder = async (root: string) => {
    this.scans++;
    this.lastFolder = root;
    return this.buildTree(root);
  };
  readFile = async (p: string) => {
    const f = this.files.get(p);
    if (!f) throw new Error(`ENOENT: ${p}`);
    return { text: f.text, stamp: this.stampOf(p)! };
  };
  statFile = async (p: string) => this.stampOf(p);
  writeFile = async (p: string, content: string) => {
    this.writes.push(p);
    this.files.set(p, { text: content, mtime: this.clock++ });
    return this.stampOf(p)!;
  };
  createFile = async (dir: string, name: string, content = '') => {
    const n = /\.(md|markdown)$/i.test(name) ? name : `${name}.md`;
    const p = `${dir}/${n}`;
    if (this.files.has(p)) throw new Error(`"${n}" already exists.`);
    this.files.set(p, { text: content, mtime: this.clock++ });
    return p;
  };
  renameNode = async (p: string, newName: string) => {
    const isFile = this.files.has(p);
    const to = `${dirname(p)}/${isFile && !/\.(md|markdown)$/i.test(newName) ? newName + '.md' : newName}`;
    if (this.files.has(to)) throw new Error('already exists');
    for (const [k, v] of [...this.files]) {
      if (isInside(k, p)) {
        this.files.delete(k);
        this.files.set(to + k.slice(p.length), v);
      }
    }
    return to;
  };
  trashNode = async (p: string) => {
    if (this.failTrash) throw new Error('trash unavailable');
    for (const k of [...this.files.keys()]) if (isInside(k, p)) this.files.delete(k);
    this.trashed.push(p);
  };
  reveal = (p: string) => void this.revealed.push(p);

  getPrefs = async () => this.prefs;
  setPrefs = (patch: Partial<Prefs>) => void Object.assign(this.prefs, patch);
  getSession = async (folder: string) => this.sessions.get(folder) ?? null;
  saveSession = (folder: string, s: Session) => void this.sessions.set(folder, s);

  saveDraft = async (d: DraftRecord) => void this.drafts.set(d.file, d);
  clearDraft = async (file: string) => void this.drafts.delete(file);
  listDrafts = async () => [...this.drafts.values()];

  confirmUnsaved = async (name: string) => {
    this.unsavedAsked.push(name);
    return this.unsavedAnswers.shift() ?? 'cancel';
  };
  confirmOverwrite = async () => this.overwriteAnswers.shift() ?? true;
  confirmDelete = async () => this.deleteAnswers.shift() ?? true;
  confirmRecover = async () => this.recoverAnswers.shift() ?? true;

  setDirtyFiles = (names: string[]) => void this.dirtyReports.push(names);
  onCloseRequested = () => () => undefined;
  reportCloseDecision = () => undefined;
  onMenuAction = (_cb: (a: MenuAction) => void) => () => undefined;
}
