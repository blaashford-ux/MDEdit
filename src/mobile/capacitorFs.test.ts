import { MemoryFs } from '../shared/memoryFs';
import { fsPortSuite } from '../shared/fsPortSuite';
import { createCapacitorFs, type FilesystemLike } from './capacitorFs';

/**
 * A stand-in for Capacitor's Filesystem plugin that is deliberately strict and unhelpful, like the real one:
 * it throws plain errors with no codes, refuses to overwrite on rename, to recreate folders, and to write without a
 * parent folder. The adapter must still honour the FsPort contract on top of it.
 */
function fakePlugin(mem: MemoryFs): FilesystemLike {
  const p = (path: string) => '/' + path.replace(/^\/+/, '');
  const plain = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch {
      throw new Error('Operation failed');
    }
  };
  return {
    readFile: ({ path }) => plain(async () => ({ data: await mem.readText(p(path)) })),
    writeFile: ({ path, data, recursive }) => plain(async () => {
      if (recursive) await mem.mkdir(p(path).replace(/\/[^/]*$/, ''), { recursive: true });
      await mem.writeText(p(path), data);
    }),
    deleteFile: ({ path }) => plain(() => mem.rm(p(path))),
    mkdir: ({ path, recursive }) => plain(() => mem.mkdir(p(path), { recursive })),
    rmdir: ({ path, recursive }) => plain(() => mem.rm(p(path), { recursive })),
    readdir: ({ path }) => plain(async () => ({ files: (await mem.readdir(p(path))).map((e) => ({ name: e.name, type: e.isDirectory ? 'directory' : 'file', size: 0, mtime: 1 })) })),
    stat: ({ path }) => plain(async () => {
      const st = await mem.stat(p(path));
      if (!st) throw new Error('missing');
      return { type: st.isDirectory ? 'directory' : 'file', size: st.size, mtime: st.mtimeMs };
    }),
    rename: ({ from, to }) => plain(async () => {
      if (await mem.stat(p(to))) throw new Error('destination exists'); // the real plugin does not overwrite
      await mem.rename(p(from), p(to));
    }),
    copy: ({ from, to }) => plain(async () => {
      if (await mem.stat(p(to))) throw new Error('destination exists');
      await mem.copy(p(from), p(to));
    }),
  };
}

fsPortSuite('Capacitor adapter (fake plugin)', async () => {
  const mem = new MemoryFs();
  const fs = createCapacitorFs(fakePlugin(mem));
  await fs.mkdir('/data', { recursive: true });
  return { fs, root: '/data', join: (...parts) => parts.join('/') };
});
