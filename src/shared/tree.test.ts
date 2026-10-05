import { describe, expect, it } from 'vitest';
import type { DirNode } from './api';
import { flattenPaths } from './tree';

describe('flattenPaths', () => {
  it('collects the root, nested folders and files', () => {
    const tree: DirNode = {
      kind: 'dir', name: 'r', path: '/r',
      children: [
        { kind: 'dir', name: 'a', path: '/r/a', children: [{ kind: 'file', name: 'x.md', path: '/r/a/x.md' }] },
        { kind: 'file', name: 'y.md', path: '/r/y.md' }
      ]
    };
    expect([...flattenPaths(tree)].sort()).toEqual(['/r', '/r/a', '/r/a/x.md', '/r/y.md']);
  });
});
