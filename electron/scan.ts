import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DirNode, TreeNode } from '../src/shared/api';

const MD_EXT = /\.(md|markdown)$/i;
const SKIP_DIRS = new Set(['node_modules']);

const byName = (a: TreeNode, b: TreeNode) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Recursively collects Markdown files and folders under `dir`. Folders come before files,
 * both sorted naturally. Empty folders are kept (so you can add files to them); hidden
 * folders, node_modules and symlinks are skipped (no loops).
 */
export async function scanFolder(dir: string): Promise<DirNode> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const dirs: DirNode[] = [];
  const files: TreeNode[] = [];

  await Promise.all(
    entries.map(async (e) => {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) return;
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) return;
        try {
          dirs.push(await scanFolder(full));
        } catch {
          // unreadable folder (permissions): skip it
        }
      } else if (e.isFile() && MD_EXT.test(e.name)) {
        files.push({ kind: 'file', name: e.name, path: full });
      }
    })
  );

  dirs.sort(byName);
  files.sort(byName);
  return { kind: 'dir', name: path.basename(dir) || dir, path: dir, children: [...dirs, ...files] };
}
