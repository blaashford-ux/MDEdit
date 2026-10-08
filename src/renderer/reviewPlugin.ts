import type { Node as PmNode } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view';
import { locateAnchor, makeAnchor, type Anchor } from '../shared/review/comments';

/** A note as the editor needs it: where to draw it and how. */
export interface NoteMark {
  id: string;
  anchor: Anchor;
  kind: 'comment' | 'suggestion';
}

/** What the open chapter says about each note: found (drawn) or lost (its text was changed away). */
export interface NoteStatus {
  detached: string[];
}

export interface ReviewApi {
  /** Draws these notes and reports which ones can no longer be found in the text. */
  setNotes(notes: NoteMark[]): NoteStatus;
  /** The current selection as an anchor, or null when nothing is selected. `oneBlock` is false if it crosses paragraphs. */
  selection(): { anchor: Anchor; oneBlock: boolean } | null;
  /**
   * What a note should attach to when the user right-clicks at screen point (x, y): the selection if the click is inside it,
   * otherwise the paragraph under the pointer (which is selected so the user can see it). Null over empty text.
   */
  selectionAt(x: number, y: number): { anchor: Anchor; oneBlock: boolean } | null;
  /** Highlights a note and, unless `scroll` is false, scrolls to it (without taking focus). */
  reveal(id: string, scroll?: boolean): boolean;
  /** Replaces a note's quoted text (single paragraph only); false when it can't be found. */
  replace(id: string, text: string): boolean;
  /** Called when the user clicks highlighted text. */
  onClick(cb: ((id: string) => void) | null): void;
}

interface Segment {
  /** Document position where the text of this block starts. */
  pos: number;
  /** Offset of the block's text in the flat text. */
  offset: number;
  length: number;
}

export interface Flat {
  text: string;
  segments: Segment[];
}

/** The chapter as plain text: each text block's text, blocks separated by a newline. Anchors live in this text. */
export function flatten(doc: PmNode): Flat {
  const segments: Segment[] = [];
  let text = '';
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const t = node.textBetween(0, node.content.size, '\n', '￼');
    if (segments.length) text += '\n';
    segments.push({ pos: pos + 1, offset: text.length, length: t.length });
    text += t;
    return false;
  });
  return { text, segments };
}

/** Flat-text offset to document position. A range start prefers the later block at a boundary, an end the earlier. */
export function offsetToPos(flat: Flat, offset: number, edge: 'start' | 'end'): number | null {
  const hits = flat.segments.filter((s) => offset >= s.offset && offset <= s.offset + s.length);
  if (!hits.length) return null;
  const s = edge === 'start' ? hits[hits.length - 1] : hits[0];
  return s.pos + (offset - s.offset);
}

export function posToOffset(flat: Flat, pos: number): number | null {
  const s = flat.segments.find((x) => pos >= x.pos && pos <= x.pos + x.length);
  return s ? s.offset + (pos - s.pos) : null;
}

interface State {
  notes: NoteMark[];
  found: Map<string, { from: number; to: number }>;
  active: string | null;
  decos: DecorationSet;
}

interface Meta {
  notes?: NoteMark[];
  active?: string | null;
}

export const reviewKey = new PluginKey<State>('mdedit-review');

function compute(doc: PmNode, notes: NoteMark[], active: string | null): State {
  const flat = flatten(doc);
  const found = new Map<string, { from: number; to: number }>();
  const decos: Decoration[] = [];
  for (const n of notes) {
    const at = locateAnchor(flat.text, n.anchor);
    if (!at) continue;
    const from = offsetToPos(flat, at.start, 'start');
    const to = offsetToPos(flat, at.end, 'end');
    if (from === null || to === null || to <= from) continue;
    found.set(n.id, { from, to });
    decos.push(
      Decoration.inline(from, to, {
        class: `review-mark review-${n.kind}${n.id === active ? ' review-active' : ''}`,
        'data-note': n.id
      })
    );
  }
  return { notes, found, active, decos: DecorationSet.create(doc, decos) };
}

let clickHandler: ((id: string) => void) | null = null;

export const reviewPlugin = new Plugin<State>({
  key: reviewKey,
  state: {
    init: () => ({ notes: [], found: new Map(), active: null, decos: DecorationSet.empty }),
    apply(tr, prev, _old, next) {
      const meta = tr.getMeta(reviewKey) as Meta | undefined;
      if (!meta && !tr.docChanged) return prev;
      return compute(next.doc, meta?.notes ?? prev.notes, meta && 'active' in meta ? (meta.active ?? null) : prev.active);
    }
  },
  props: {
    decorations: (state) => reviewKey.getState(state)?.decos,
    handleClick(_view, _pos, event) {
      const el = (event.target as HTMLElement | null)?.closest?.('[data-note]');
      const id = el?.getAttribute('data-note');
      if (id && clickHandler) clickHandler(id);
      return false;
    }
  }
});

const stateOf = (view: EditorView) => reviewKey.getState(view.state)!;

/** The review operations for one ProseMirror view. */
export function reviewApiFor(getView: () => EditorView | null): ReviewApi {
  return {
    setNotes(notes) {
      const view = getView();
      if (!view) return { detached: [] };
      view.dispatch(view.state.tr.setMeta(reviewKey, { notes }));
      const { found } = stateOf(view);
      return { detached: notes.filter((n) => !found.has(n.id)).map((n) => n.id) };
    },

    selection() {
      const view = getView();
      if (!view) return null;
      const { from, to, empty } = view.state.selection;
      if (empty) return null;
      const flat = flatten(view.state.doc);
      const a = posToOffset(flat, from);
      const b = posToOffset(flat, to);
      if (a === null || b === null || b <= a || !flat.text.slice(a, b).trim()) return null; // nothing but blank space
      return {
        anchor: makeAnchor(flat.text, a, b),
        oneBlock: !flat.text.slice(a, b).includes('\n')
      };
    },

    selectionAt(x, y) {
      const view = getView();
      if (!view) return null;
      const at = view.posAtCoords({ left: x, top: y })?.pos;
      const { from, to, empty } = view.state.selection;
      if (!empty && (at === undefined || (at >= from && at <= to))) {
        const current = this.selection();
        if (current) return current;
      }
      if (at === undefined) return null;
      const $at = view.state.doc.resolve(at);
      if (!$at.parent.isTextblock || $at.parent.content.size === 0) return null;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, $at.start(), $at.end())));
      return this.selection();
    },

    reveal(id, scroll = true) {
      const view = getView();
      if (!view) return false;
      const hit = stateOf(view).found.get(id);
      view.dispatch(view.state.tr.setMeta(reviewKey, { active: hit ? id : null }));
      if (!hit) return false;
      if (!scroll) return true;
      const at = view.domAtPos(hit.from).node;
      const el = at.nodeType === 3 ? at.parentElement : (at as HTMLElement);
      el?.scrollIntoView({ block: 'center' });
      return true;
    },

    replace(id, text) {
      const view = getView();
      if (!view) return false;
      const hit = stateOf(view).found.get(id);
      if (!hit) return false;
      const flat = flatten(view.state.doc);
      const a = posToOffset(flat, hit.from);
      const b = posToOffset(flat, hit.to);
      if (a === null || b === null || flat.text.slice(a, b).includes('\n')) return false;
      const tr = view.state.tr.insertText(text, hit.from, hit.to);
      tr.setSelection(TextSelection.create(tr.doc, hit.from + text.length));
      view.dispatch(tr);
      return true;
    },

    onClick(cb) {
      clickHandler = cb;
    }
  };
}
