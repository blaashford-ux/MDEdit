import type { TreeNode } from './api';

/** Every folder and file path in the tree, including the root. */
export function flattenPaths(node: TreeNode): Set<string> {
  const out = new Set<string>();
  const walk = (n: TreeNode) => {
    out.add(n.path);
    if (n.kind === 'dir') n.children.forEach(walk);
  };
  walk(node);
  return out;
}
