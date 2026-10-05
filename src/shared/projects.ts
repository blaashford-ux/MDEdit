import { clampLevel } from './chapters';
import { sanitizeBookDetails, type BookDetails } from './export/model';
import { isDate, sanitizeGoal, type Goal } from './progress';
import { validateName } from './paths';

/**
 * Projects: a folder inside the Root Folder that carries `.mdedit/project.json`. Everything here is pure
 * (models, defensive parsing, templates, name rules); the file-system side lives in electron/projects.ts.
 */

export const PROJECT_DIR = '.mdedit';
export const PROJECT_FILE = 'project.json';
export const PROGRESS_FILE = 'progress.json';

export const STATUSES = ['planning', 'drafting', 'revising', 'editing', 'published', 'paused'] as const;
export type ProjectStatus = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planning',
  drafting: 'Drafting',
  revising: 'Revising',
  editing: 'Editing',
  published: 'Published',
  paused: 'On hold'
};

// ---- templates -----------------------------------------------------------------------------

export interface FolderNode {
  name: string;
  /** Do the words in this folder (and below) count toward the project's word-count goal? */
  counts: boolean;
  children: FolderNode[];
}

export interface StarterFile {
  /** Relative path inside the project, "/" separated (e.g. "Manuscript/Draft.md"). */
  path: string;
  content: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  folders: FolderNode[];
  files: StarterFile[];
  /** Chapter heading level for projects made from this template (null = use the app setting). */
  chapterLevel: number | null;
  /** Book defaults (author, copyright page, front/back matter, export choices…) (null = use the app defaults). */
  book: BookDetails | null;
}

export const MAX_FOLDER_DEPTH = 6;
export const MAX_TEMPLATE_FOLDERS = 200;

const folder = (name: string, counts = false, children: FolderNode[] = []): FolderNode => ({ name, counts, children });

/** The templates that ship with the app (editable; "Reset" brings them back). */
export function defaultTemplates(): ProjectTemplate[] {
  const t = (id: string, name: string, description: string, folders: FolderNode[], files: StarterFile[] = []): ProjectTemplate => ({
    id,
    name,
    description,
    folders,
    files,
    chapterLevel: null,
    book: null
  });
  return [
    t(
      'novel',
      'Novel',
      'One book: manuscript, characters, worldbuilding, research and exports.',
      [folder('Manuscript', true), folder('Characters'), folder('Worldbuilding'), folder('Research'), folder('Exports')],
      [{ path: 'Manuscript/Draft.md', content: '# Chapter 1\n\n' }]
    ),
    t(
      'series-book',
      'Series Book',
      'A book that belongs to a series, with a series bible.',
      [folder('Manuscript', true), folder('Series Bible'), folder('Characters'), folder('Research'), folder('Exports')],
      [
        { path: 'Manuscript/Draft.md', content: '# Chapter 1\n\n' },
        { path: 'Series Bible/Series Bible.md', content: '# Series Bible\n\n' }
      ]
    ),
    t('short-story', 'Short Story', 'A short story: drafts, notes and exports.', [folder('Drafts', true), folder('Notes'), folder('Exports')], [
      { path: 'Drafts/Draft.md', content: '# Title\n\n' }
    ]),
    t('blank', 'Blank', 'An empty project. Everything counts toward the goal.', [])
  ];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u001f\u007f]/g;
const text = (v: unknown, d: string, max: number) => (typeof v === 'string' ? v.replace(CTRL, ' ').trim().slice(0, max) : d);
const longText = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\u0000/g, '').slice(0, max) : '');

function sanitizeFolders(v: unknown, depth = 1): FolderNode[] {
  if (!Array.isArray(v) || depth > MAX_FOLDER_DEPTH) return [];
  return v
    .filter(isObj)
    .slice(0, 100)
    .map((n) => ({
      name: text(n.name, '', 100),
      counts: typeof n.counts === 'boolean' ? n.counts : true,
      children: sanitizeFolders(n.children, depth + 1)
    }))
    .filter((n) => n.name !== '');
}

const safeRelPath = (p: string) => p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..' && validateName(seg) === null);

export function sanitizeTemplate(raw: unknown): ProjectTemplate | null {
  if (!isObj(raw)) return null;
  const id = text(raw.id, '', 60).replace(/[^\w-]/g, '-');
  const name = text(raw.name, '', 80);
  if (!id || !name) return null;
  const files = Array.isArray(raw.files)
    ? raw.files
        .filter(isObj)
        .slice(0, 100)
        .map((f) => ({ path: text(f.path, '', 400).replace(/\\/g, '/'), content: longText(f.content, 200_000) }))
        .filter((f) => f.path !== '' && safeRelPath(f.path))
    : [];
  return {
    id,
    name,
    description: text(raw.description, '', 300),
    folders: sanitizeFolders(raw.folders),
    files,
    chapterLevel: raw.chapterLevel === null || raw.chapterLevel === undefined ? null : clampLevel(raw.chapterLevel),
    book: isObj(raw.book) ? sanitizeBookDetails(raw.book) : null
  };
}

/** A usable list: bad entries dropped, ids made unique, never empty (falls back to the built-ins). */
export function sanitizeTemplates(raw: unknown): ProjectTemplate[] {
  const list = Array.isArray(raw) ? raw.map(sanitizeTemplate).filter((t): t is ProjectTemplate => t !== null) : [];
  const seen = new Set<string>();
  const out: ProjectTemplate[] = [];
  for (const t of list.slice(0, 50)) {
    let id = t.id;
    for (let n = 2; seen.has(id); n++) id = `${t.id}-${n}`;
    seen.add(id);
    out.push({ ...t, id });
  }
  return out.length ? out : defaultTemplates();
}

/** Every folder path a template makes ("Manuscript", "Manuscript/Part 1", …) in creation order. */
export function flattenFolders(nodes: FolderNode[], prefix = ''): string[] {
  return nodes.flatMap((n) => {
    const p = prefix ? `${prefix}/${n.name}` : n.name;
    return [p, ...flattenFolders(n.children, p)];
  });
}

/** The folder paths that do NOT count toward the goal. */
export function uncountedFolders(nodes: FolderNode[], prefix = '', inherited = true): string[] {
  return nodes.flatMap((n) => {
    const p = prefix ? `${prefix}/${n.name}` : n.name;
    const counts = inherited && n.counts;
    return [...(counts ? [] : [p]), ...uncountedFolders(n.children, p, counts)];
  }).filter((p, _i, all) => !all.some((o) => o !== p && p.startsWith(o + '/'))); // a parent already excludes its children
}

/** Problems that would stop a template from being used; empty means fine. */
export function templateErrors(t: ProjectTemplate): string[] {
  const errors: string[] = [];
  if (!t.name.trim()) errors.push('The template needs a name.');
  const check = (nodes: FolderNode[], where: string, depth: number) => {
    if (depth > MAX_FOLDER_DEPTH) errors.push(`Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep.`);
    const seen = new Set<string>();
    for (const n of nodes) {
      const err = validateName(n.name);
      if (err) errors.push(`${where}“${n.name || '(empty)'}”: ${err}`);
      const key = n.name.trim().toLowerCase();
      if (seen.has(key)) errors.push(`${where}“${n.name}” appears twice.`);
      seen.add(key);
      check(n.children, `${where}${n.name}/`, depth + 1);
    }
  };
  check(t.folders, '', 1);
  if (flattenFolders(t.folders).length > MAX_TEMPLATE_FOLDERS) errors.push(`A template can have at most ${MAX_TEMPLATE_FOLDERS} folders.`);
  for (const f of t.files) if (!safeRelPath(f.path)) errors.push(`Starter file “${f.path}” has an invalid path.`);
  return errors;
}

// ---- project metadata ----------------------------------------------------------------------

export interface ProjectOverrides {
  /** null = use the app's chapter heading level. */
  chapterLevel: number | null;
  /** null = use the app's book defaults. */
  book: BookDetails | null;
}

export interface ProjectMeta {
  version: 1;
  id: string;
  name: string;
  templateId: string;
  templateName: string;
  createdAt: string;
  status: ProjectStatus;
  notes: string;
  archived: boolean;
  goal: Goal | null;
  /** Folders (relative, "/" separated) whose words do not count toward the goal. */
  excludedFolders: string[];
  overrides: ProjectOverrides;
}

export function newProjectMeta(opts: { id: string; name: string; template: ProjectTemplate; now: Date }): ProjectMeta {
  const { template: t } = opts;
  return {
    version: 1,
    id: opts.id,
    name: opts.name,
    templateId: t.id,
    templateName: t.name,
    createdAt: opts.now.toISOString(),
    status: 'planning',
    notes: '',
    archived: false,
    goal: null,
    excludedFolders: uncountedFolders(t.folders),
    overrides: { chapterLevel: t.chapterLevel, book: t.book ? structuredClone(t.book) : null }
  };
}

export function sanitizeProjectMeta(raw: unknown, fallbackName: string, today: string): ProjectMeta {
  const r = isObj(raw) ? raw : {};
  const o = isObj(r.overrides) ? r.overrides : {};
  const name = text(r.name, fallbackName, 200) || fallbackName;
  return {
    version: 1,
    id: text(r.id, '', 80) || `p-${Math.abs(hash(name))}`,
    name,
    templateId: text(r.templateId, 'blank', 60),
    templateName: text(r.templateName, 'Blank', 80),
    createdAt: typeof r.createdAt === 'string' && !Number.isNaN(Date.parse(r.createdAt)) ? r.createdAt : new Date(0).toISOString(),
    status: (STATUSES as readonly string[]).includes(r.status as string) ? (r.status as ProjectStatus) : 'planning',
    notes: longText(r.notes, 5000),
    archived: r.archived === true,
    goal: sanitizeGoal(r.goal, today),
    excludedFolders: Array.isArray(r.excludedFolders)
      ? r.excludedFolders.filter((x): x is string => typeof x === 'string' && safeRelPath(x.replace(/\\/g, '/'))).map((x) => x.replace(/\\/g, '/')).slice(0, 200)
      : [],
    overrides: {
      chapterLevel: o.chapterLevel === null || o.chapterLevel === undefined ? null : clampLevel(o.chapterLevel),
      book: isObj(o.book) ? sanitizeBookDetails(o.book) : null
    }
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ---- names ---------------------------------------------------------------------------------

/** An error message for a project name, or null. `existing` are the names already in the Root Folder. */
export function projectNameError(name: string, existing: readonly string[] = []): string | null {
  const n = name.trim();
  const base = validateName(n);
  if (base) return base;
  if (n.startsWith('.')) return 'Names cannot start with a period.';
  if (existing.some((e) => e.toLowerCase() === n.toLowerCase())) return `There is already a project or folder called “${n}”.`;
  return null;
}

/** "The Lost King" → "The Lost King 2" … the first name not in `existing` (case-insensitive). */
export function uniqueName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing.map((e) => e.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 1000; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
  return `${base} ${Date.now()}`;
}

/** The default Root Folder: `<home>\MDEdit` (or `/` on POSIX). */
export function defaultRootFolder(home: string): string {
  const sep = home.includes('\\') && !home.includes('/') ? '\\' : '/';
  return home.replace(/[\\/]+$/, '') + sep + 'MDEdit';
}

export { isDate };
