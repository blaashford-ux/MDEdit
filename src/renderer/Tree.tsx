import type { DirNode, TreeNode } from '../shared/api';
import type { MarkdownDoc } from '../shared/chapters';

export interface Selection {
  file: string;
  chapter: number;
}

interface Props {
  root: DirNode;
  expanded: Set<string>;
  docs: Map<string, MarkdownDoc>;
  selection: Selection | null;
  onToggle(path: string, isFile: boolean): void;
  onSelect(sel: Selection): void;
}

export function chapterLabel(c: { title: string; isPreamble: boolean }): string {
  if (c.isPreamble) return '(Preamble)';
  return c.title || '(untitled)';
}

export function Tree(props: Props) {
  return (
    <ul role="tree" className="tree">
      {props.root.children.map((n) => (
        <Node key={n.path} node={n} depth={0} {...props} />
      ))}
    </ul>
  );
}

function Node({ node, depth, ...p }: Props & { node: TreeNode; depth: number }) {
  const open = p.expanded.has(node.path);
  const pad = { paddingLeft: 8 + depth * 14 };

  if (node.kind === 'dir') {
    return (
      <li role="treeitem" aria-expanded={open}>
        <button className="row" style={pad} onClick={() => p.onToggle(node.path, false)}>
          <span className="caret">{open ? '▾' : '▸'}</span> 📁 {node.name}
        </button>
        {open && (
          <ul role="group">
            {node.children.map((c) => (
              <Node key={c.path} node={c} depth={depth + 1} {...p} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const doc = p.docs.get(node.path);
  return (
    <li role="treeitem" aria-expanded={open}>
      <button className="row" style={pad} onClick={() => p.onToggle(node.path, true)}>
        <span className="caret">{open ? '▾' : '▸'}</span> 📄 {node.name}
      </button>
      {open && (
        <ul role="group">
          {!doc && (
            <li className="row muted" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
              Loading…
            </li>
          )}
          {doc?.chapters.map((c, i) => {
            const active = p.selection?.file === node.path && p.selection.chapter === i;
            return (
              <li role="treeitem" key={i}>
                <button
                  className={'row chapter' + (active ? ' active' : '')}
                  style={{ paddingLeft: 8 + (depth + 1) * 14 }}
                  onClick={() => p.onSelect({ file: node.path, chapter: i })}
                >
                  {chapterLabel(c)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
