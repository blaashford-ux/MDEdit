/**
 * Project packs: a project exported as one zip so it can be imported into another MDEdit, or read by another tool
 * (Cadrel imports one as a project under its Studio). Everything here is pure; electron/projectPack.ts does the file work.
 * The format is described in docs/project-pack-format.md.
 *
 *   mdedit-pack.json              the manifest (below)
 *   project/<anything>            the project folder exactly as on disk, including project/.mdedit/project.json
 */

export const PACK_FORMAT = 'mdedit-project-pack';
export const PACK_VERSION = 1;
export const PACK_MANIFEST = 'mdedit-pack.json';
export const PACK_ROOT = 'project';
export const PACK_EXT = 'zip';
/** Limits applied on import, so a hostile or broken zip cannot fill the disk or hang the app. */
export const PACK_MAX_ENTRIES = 50_000;
export const PACK_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export interface PackFile {
  /** Relative to the project folder, "/" separated. */
  path: string;
  size: number;
}

export interface PackManifest {
  format: typeof PACK_FORMAT;
  formatVersion: number;
  exportedAt: string;
  app: { name: 'MDEdit'; version: string };
  project: {
    id: string;
    name: string;
    templateId: string;
    templateName: string;
    status: string;
    /** The Markdown words in the project when exported (Markdown files only; nothing excluded from the goal). */
    words: number;
    /** The manuscript file goals follow, relative to the project; null = whole project. */
    activeManuscript: string | null;
  };
  files: PackFile[];
}

/** Files that are history or leftovers rather than the project itself, and so are not packed. */
export function isPackable(rel: string): boolean {
  const parts = rel.split('/');
  const name = parts[parts.length - 1];
  if (parts[0] === '.mdedit' && parts.length === 2 && /^progress.*\.json(\.bak)?$/.test(name)) return false;
  if (parts[0] === '.mdedit' && name === 'project.json.bak') return false;
  return name !== 'Thumbs.db' && name !== '.DS_Store' && name !== 'desktop.ini';
}

/** True for a relative path that stays inside its folder: no "..", no absolute or drive paths, no empty parts. */
export function isSafeEntryPath(rel: string): boolean {
  if (!rel || rel.length > 1024 || rel.includes('\\') || rel.includes('\0') || rel.startsWith('/') || /^[a-zA-Z]:/.test(rel)) return false;
  return rel.split('/').every((p) => p !== '' && p !== '.' && p !== '..');
}

export const packFileName = (projectName: string): string => `${projectName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'Project'}.mdedit.${PACK_EXT}`;

/** Reads a manifest defensively; returns a message instead of throwing so callers can show it. */
export function parseManifest(text: string): PackManifest | string {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return 'The pack’s manifest is not valid JSON.';
  }
  const r = raw as Partial<PackManifest> | null;
  if (!r || typeof r !== 'object' || r.format !== PACK_FORMAT) return 'This is not an MDEdit project pack.';
  if (typeof r.formatVersion !== 'number' || r.formatVersion > PACK_VERSION) return 'This pack was made by a newer version of MDEdit. Update MDEdit to import it.';
  if (!r.project || typeof r.project.name !== 'string' || !r.project.name.trim()) return 'The pack has no project name.';
  if (!Array.isArray(r.files)) return 'The pack has no file list.';
  return r as PackManifest;
}
