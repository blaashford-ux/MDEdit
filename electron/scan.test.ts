import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanFolder } from './scan';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'mdedit-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const touch = async (rel: string) => {
  const p = path.join(root, rel);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, '# x\n');
};
const names = (n: { children: { name: string }[] }) => n.children.map((c) => c.name);

describe('scanFolder', () => {
  it('lists folders first, then files, naturally sorted, md/markdown only', async () => {
    await touch('b.md');
    await touch('a10.md');
    await touch('a2.MD');
    await touch('notes.txt');
    await touch('z.markdown');
    await touch('sub/inner.md');
    const tree = await scanFolder(root);
    expect(names(tree)).toEqual(['sub', 'a2.MD', 'a10.md', 'b.md', 'z.markdown']);
  });

  it('keeps empty folders and folders without Markdown, but skips hidden and node_modules', async () => {
    await touch('docs/readme.txt');
    await touch('.git/x.md');
    await touch('node_modules/pkg/readme.md');
    await touch('keep/deep/er/file.md');
    await mkdir(path.join(root, 'empty'));
    await mkdir(path.join(root, 'empty-nested/inner'), { recursive: true });
    const tree = await scanFolder(root);
    expect(names(tree)).toEqual(['docs', 'empty', 'empty-nested', 'keep']);
    const find = (n: { children: { name: string }[] }, name: string) => n.children.find((c) => c.name === name) as { children: unknown[] };
    expect(find(tree, 'empty').children).toEqual([]);
    expect(names(find(tree, 'empty-nested') as never)).toEqual(['inner']);
    expect(find(tree, 'docs').children).toEqual([]); // the .txt is not listed
  });

  it('skips symlinks', async () => {
    await touch('real/a.md');
    await symlink(path.join(root, 'real'), path.join(root, 'link'));
    expect(names(await scanFolder(root))).toEqual(['real']);
  });
});
