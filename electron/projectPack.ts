import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import {
  isPackable, isSafeEntryPath, PACK_FORMAT, PACK_MANIFEST, PACK_MAX_BYTES, PACK_MAX_ENTRIES, PACK_ROOT, PACK_VERSION, parseManifest, type PackFile, type PackManifest
} from '../src/shared/projectPack';
import { PROJECT_DIR, PROJECT_FILE, projectNameError, uniqueName } from '../src/shared/projects';
import { countProject, readMeta, writeMeta, type Deps } from './projects';
import { writeBytesAtomic } from './files';

const MD = /\.(md|markdown)$/i;

async function walk(dir: string, rel = ''): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) continue; // never follow links out of the project
    if (e.isDirectory()) out.push(...(await walk(dir, r)));
    else if (e.isFile() && isPackable(r)) out.push(r);
  }
  return out;
}

/** Zips the project folder at `dir` into `zipPath`. Returns the manifest that was written. */
export async function exportProject(dir: string, zipPath: string, appVersion: string, deps: Deps = {}): Promise<PackManifest> {
  const meta = await readMeta(dir, deps.now);
  if (!meta) throw new Error('That folder is not a project.');
  const rels = await walk(dir);
  const zippable: Zippable = {};
  const files: PackFile[] = [];
  let total = 0;
  for (const rel of rels) {
    const data = await fs.readFile(path.join(dir, ...rel.split('/')));
    total += data.length;
    if (total > PACK_MAX_BYTES) throw new Error('The project is too large to export as one pack.');
    zippable[`${PACK_ROOT}/${rel}`] = [new Uint8Array(data), { level: MD.test(rel) ? 6 : 0, mtime: (await fs.stat(path.join(dir, ...rel.split('/')))).mtime }];
    files.push({ path: rel, size: data.length });
  }
  const manifest: PackManifest = {
    format: PACK_FORMAT,
    formatVersion: PACK_VERSION,
    exportedAt: (deps.now?.() ?? new Date()).toISOString(),
    app: { name: 'MDEdit', version: appVersion },
    project: {
      id: meta.id,
      name: meta.name,
      templateId: meta.templateId,
      templateName: meta.templateName,
      status: meta.status,
      words: (await countProject(dir, [])).words,
      activeManuscript: meta.activeManuscript
    },
    files: files.sort((a, b) => a.path.localeCompare(b.path))
  };
  zippable[PACK_MANIFEST] = strToU8(JSON.stringify(manifest, null, 2) + '\n');
  await fs.mkdir(path.dirname(zipPath), { recursive: true });
  await writeBytesAtomic(zipPath, Buffer.from(zipSync(zippable)));
  return manifest;
}

/**
 * Unpacks a pack into a new project folder inside `root`. Built in a hidden temporary folder and renamed into place, so a
 * bad pack leaves nothing behind. A name already taken gets a number added. The project gets a fresh id when its old one is
 * already used by a project in `root`, so an import never overwrites or doubles up with the original.
 */
export async function importProject(zipPath: string, root: string, deps: Deps = {}): Promise<{ path: string; meta: Awaited<ReturnType<typeof readMeta>> & object }> {
  const now = deps.now ?? (() => new Date());
  const bytes = new Uint8Array(await fs.readFile(zipPath));
  let entries: Record<string, Uint8Array>;
  let count = 0;
  let size = 0;
  try {
    entries = unzipSync(bytes, {
      filter: (f) => {
        if (++count > PACK_MAX_ENTRIES) throw new Error('The pack has too many files.');
        size += f.originalSize;
        if (size > PACK_MAX_BYTES) throw new Error('The pack is too large to import.');
        return true;
      }
    });
  } catch (e) {
    throw new Error(e instanceof Error && /too (many|large)/.test(e.message) ? e.message : 'That file is not a readable zip.');
  }
  const mtext = entries[PACK_MANIFEST];
  if (!mtext) throw new Error('This is not an MDEdit project pack (no manifest).');
  const manifest = parseManifest(strFromU8(mtext));
  if (typeof manifest === 'string') throw new Error(manifest);

  const prefix = `${PACK_ROOT}/`;
  const files = Object.entries(entries).filter(([name]) => name.startsWith(prefix) && !name.endsWith('/'));
  for (const [name] of files) if (!isSafeEntryPath(name.slice(prefix.length))) throw new Error(`The pack contains an unsafe path (“${name}”).`);
  if (!files.some(([name]) => name === `${prefix}${PROJECT_DIR}/${PROJECT_FILE}`)) throw new Error('The pack has no project settings.');

  await fs.mkdir(root, { recursive: true });
  const taken = (await fs.readdir(root)).filter((n) => !n.startsWith('.'));
  let name = manifest.project.name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(0, 100).trim() || 'Imported project';
  name = uniqueName(name, taken);
  const bad = projectNameError(name, taken);
  if (bad) throw new Error(bad);
  const target = path.join(root, name);
  const tmp = path.join(root, `.${name}.importing-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    await fs.mkdir(tmp);
    for (const [entry, data] of files) {
      const full = path.join(tmp, ...entry.slice(prefix.length).split('/'));
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, data, { flag: 'wx' });
    }
    const meta = await readMeta(tmp, now);
    if (!meta) throw new Error('The pack’s project settings could not be read.');
    const ids = new Set<string>();
    for (const n of taken) ids.add((await readMeta(path.join(root, n), now).catch(() => null))?.id ?? '');
    const imported = { ...meta, name, id: ids.has(meta.id) ? `${meta.id}-${Math.random().toString(36).slice(2, 8)}` : meta.id };
    await writeMeta(tmp, imported);
    if (await fs.lstat(target).then(() => true, () => false)) throw new Error(`There is already a project or folder called “${name}”.`);
    await fs.rename(tmp, target);
    return { path: target, meta: imported };
  } catch (e) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    throw e;
  }
}
