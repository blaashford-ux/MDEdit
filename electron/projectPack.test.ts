import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultTemplates } from '../src/shared/projects';
import { PACK_MANIFEST } from '../src/shared/projectPack';
import { exportProject, importProject } from './projectPack';
import { createProject, readMeta, recordProgress } from './projects';

let base: string;
let a: string;
let b: string;
beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'mdedit-pack-'));
  a = path.join(base, 'a');
  b = path.join(base, 'b');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});
const novel = () => defaultTemplates().find((t) => t.id === 'novel')!;

describe('project packs', () => {
  it('round-trips a project into another root, leaving history behind', async () => {
    const { path: dir } = await createProject(a, 'The Lost King', novel(), { uuid: () => 'id-1' });
    await writeFile(path.join(dir, 'Manuscript', 'Draft.md'), '# One\n\nhello brave new world\n');
    await mkdir(path.join(dir, 'Research'), { recursive: true });
    await writeFile(path.join(dir, 'Research', 'cover.png'), Buffer.from([1, 2, 3, 0, 255]));
    await recordProgress(dir);
    const zip = path.join(base, 'pack.zip');
    const manifest = await exportProject(dir, zip, '9.9.9');
    expect(manifest.project).toMatchObject({ id: 'id-1', name: 'The Lost King', templateId: 'novel' });
    expect(manifest.files.map((f) => f.path)).toContain('.mdedit/project.json');
    expect(manifest.files.some((f) => /progress/.test(f.path))).toBe(false);

    const r = await importProject(zip, b);
    expect(r.path).toBe(path.join(b, 'The Lost King'));
    expect(await readFile(path.join(r.path, 'Manuscript', 'Draft.md'), 'utf8')).toBe('# One\n\nhello brave new world\n');
    expect([...(await readFile(path.join(r.path, 'Research', 'cover.png')))]).toEqual([1, 2, 3, 0, 255]);
    expect((await readMeta(r.path))!.id).toBe('id-1');
    expect(await readdir(b)).toEqual(['The Lost King']);
  });

  it('numbers the name and renews the id when the project is already there', async () => {
    const { path: dir } = await createProject(a, 'Book', novel(), { uuid: () => 'id-1' });
    const zip = path.join(base, 'pack.zip');
    await exportProject(dir, zip, '1');
    const r = await importProject(zip, a);
    expect(path.basename(r.path)).toBe('Book 2');
    expect(r.meta.name).toBe('Book 2');
    expect(r.meta.id).not.toBe('id-1');
  });

  it('refuses things that are not packs and leaves nothing behind', async () => {
    await mkdir(b);
    const bad = path.join(base, 'bad.zip');
    await writeFile(bad, 'not a zip');
    await expect(importProject(bad, b)).rejects.toThrow(/readable zip/);
    await writeFile(bad, zipSync({ 'readme.txt': strToU8('hi') }));
    await expect(importProject(bad, b)).rejects.toThrow(/not an MDEdit project pack/);
    const { path: dir } = await createProject(a, 'P', novel());
    const zip = path.join(base, 'pack.zip');
    await exportProject(dir, zip, '1');
    const files = unzipSync(new Uint8Array(await readFile(zip)));
    await writeFile(bad, zipSync({ [PACK_MANIFEST]: files[PACK_MANIFEST], 'project/../../evil.md': strToU8('x'), 'project/.mdedit/project.json': files['project/.mdedit/project.json'] }));
    await expect(importProject(bad, b)).rejects.toThrow(/unsafe path/);
    const m = JSON.parse(strFromU8(files[PACK_MANIFEST]));
    await writeFile(bad, zipSync({ [PACK_MANIFEST]: strToU8(JSON.stringify({ ...m, formatVersion: 99 })), 'project/.mdedit/project.json': files['project/.mdedit/project.json'] }));
    await expect(importProject(bad, b)).rejects.toThrow(/newer version/);
    expect(await readdir(b)).toEqual([]);
  });
});
