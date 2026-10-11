import type { FsPort } from '../fsPort';
import { classify } from '../sync/rules';

/** A snapshot of a project's text that a reviewer downloads: one JSON file with every manuscript file in it. */
export interface ReviewPackage {
  version: 1;
  project: string;
  publishedAt: string;
  files: { path: string; text: string }[];
}

const MAX_FILES = 600;

/** Every prose file in the project folder (Markdown only; settings, exports and hidden folders are left out). */
export async function buildPackage(fs: FsPort, dir: string, project: string, now: () => Date = () => new Date()): Promise<ReviewPackage> {
  const files: { path: string; text: string }[] = [];
  const walk = async (rel: string): Promise<void> => {
    const entries = (await fs.readdir(rel ? `${dir}/${rel}` : dir)).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (e.isSymbolicLink) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory) {
        if (!e.name.startsWith('.')) await walk(r);
      } else if (e.isFile && classify(r) === 'prose' && files.length < MAX_FILES) {
        files.push({ path: r, text: await fs.readText(`${dir}/${r}`) });
      }
    }
  };
  await walk('');
  return { version: 1, project, publishedAt: now().toISOString(), files };
}

export function parsePackage(raw: string): ReviewPackage | null {
  try {
    const d = JSON.parse(raw) as Partial<ReviewPackage>;
    if (d.version !== 1 || typeof d.project !== 'string' || !Array.isArray(d.files)) return null;
    const files = d.files.filter(
      (f): f is { path: string; text: string } =>
        !!f && typeof f.path === 'string' && typeof f.text === 'string' && !f.path.split('/').some((s) => s === '..' || s === '') && !/^[A-Za-z]:|^[\\/]/.test(f.path) && !f.path.includes('\\')
    );
    return { version: 1, project: d.project, publishedAt: String(d.publishedAt ?? ''), files };
  } catch {
    return null;
  }
}

/** Marker file in a shared project's folder: where it came from and what it contained. */
export const SHARED_MARKER = '.mdedit/shared.json';

export interface SharedMarker {
  packageId: string;
  commentsId: string;
  reviewerId: string;
  project: string;
  packageMd5: string | null;
  /** Files the last download wrote, so a later download can remove the ones the owner deleted. */
  files: string[];
}

export async function readMarker(fs: FsPort, dir: string): Promise<SharedMarker | null> {
  try {
    const m = JSON.parse(await fs.readText(`${dir}/${SHARED_MARKER}`)) as Partial<SharedMarker>;
    if (typeof m.packageId !== 'string' || typeof m.commentsId !== 'string' || typeof m.reviewerId !== 'string') return null;
    return { packageId: m.packageId, commentsId: m.commentsId, reviewerId: m.reviewerId, project: String(m.project ?? ''), packageMd5: m.packageMd5 ?? null, files: Array.isArray(m.files) ? m.files.map(String) : [] };
  } catch {
    return null;
  }
}

export async function writeMarker(fs: FsPort, dir: string, m: SharedMarker): Promise<void> {
  await fs.mkdir(`${dir}/.mdedit`, { recursive: true });
  await fs.writeText(`${dir}/${SHARED_MARKER}`, JSON.stringify(m, null, 2));
}

/** Writes the package's files into `dir` and removes files an earlier download wrote that are gone now. */
export async function writePackage(fs: FsPort, dir: string, pkg: ReviewPackage, previous: string[]): Promise<string[]> {
  await fs.mkdir(dir, { recursive: true });
  const keep = new Set(pkg.files.map((f) => f.path));
  for (const old of previous) if (!keep.has(old)) await fs.rm(`${dir}/${old}`, { force: true }).catch(() => undefined);
  for (const f of pkg.files) {
    const slash = f.path.lastIndexOf('/');
    if (slash > 0) await fs.mkdir(`${dir}/${f.path.slice(0, slash)}`, { recursive: true });
    await fs.writeText(`${dir}/${f.path}`, f.text);
  }
  return pkg.files.map((f) => f.path);
}
