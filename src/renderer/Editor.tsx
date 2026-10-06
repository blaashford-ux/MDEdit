import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { editorViewCtx } from '@milkdown/kit/core';
import { Selection } from '@milkdown/kit/prose/state';
import { $prose, replaceAll } from '@milkdown/kit/utils';
import { useEffect, useRef, useState } from 'react';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/classic.css';
import { blockLines } from '../shared/lines';
import { pickScene } from '../shared/sceneBreaks';
import { LineGutter, type LineMark } from './LineGutter';
import { findApiFor, findPlugin } from './findPlugin';
import type { SceneNav } from './sceneNav';

interface Props {
  /** The chapter as it is on disk. Read once on mount: remount (via `key`) to load another. */
  initial: string;
  /**
   * Unsaved text to put back on top of `initial` when the editor mounts (switching from source
   * mode, crash recovery). Because it is applied after `initial`, it counts as an edit.
   */
  restore: string | null;
  /**
   * Called when the user's edits change the Markdown. Receives null when the content is
   * back to the saved state, so merely opening a chapter is never "dirty" even though
   * the editor may normalise the Markdown it was given.
   */
  onChange(markdown: string | null): void;
  /**
   * Set after each successful save: `markdown` (what was written) becomes the "clean" baseline.
   * Anything typed while the save was in flight stays dirty.
   */
  saved: { version: number; markdown: string } | null;
  /** Hands the parent a way to jump between scene breaks (null on unmount). */
  onNav?(nav: SceneNav | null): void;
  /** The file line this chapter starts on, so the gutter shows file-wide line numbers. */
  firstLine: number;
}

export function Editor({ initial, restore, onChange, saved, onNav, firstLine }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [marks, setMarks] = useState<LineMark[]>([]);
  const blockPos = useRef<number[]>([]);
  const marksRef = useRef<LineMark[]>([]);
  const measureRef = useRef<() => void>(() => {});
  const firstLineRef = useRef(firstLine);
  firstLineRef.current = firstLine;
  const crepeRef = useRef<Crepe | null>(null);
  const baseline = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const mountProps = useRef({ initial, restore });
  const onNavRef = useRef(onNav);
  onNavRef.current = onNav;

  useEffect(() => {
    const crepe = new Crepe({
      root: host.current,
      defaultValue: mountProps.current.initial,
      features: {
        [CrepeFeature.AI]: false,
        [CrepeFeature.ImageBlock]: false,
        [CrepeFeature.Latex]: false
      }
    });
    let disposed = false;
    baseline.current = null;
    let frame = 0;
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => !disposed && measureRef.current());
    };
    const ro = new ResizeObserver(scheduleMeasure);
    if (host.current) ro.observe(host.current);

    crepe.on((l) => {
      l.markdownUpdated((_ctx, md) => {
        if (disposed) return;
        // An update before the baseline is known is the editor normalising its input.
        if (baseline.current === null) baseline.current = md;
        onChangeRef.current(md === baseline.current ? null : md);
        scheduleMeasure();
      });
    });
    crepe.editor.use($prose(() => findPlugin)); // highlights for Find & Replace
    const getView = () => (crepeRef.current ? crepeRef.current.editor.action((ctx) => ctx.get(editorViewCtx)) : null);
    /**
     * Gives each top-level block its source line. While the chapter is unedited that is the file's own
     * text; once edited it is what saving would write, so the numbers match the file after a save.
     */
    const measure = () => {
      const view = getView();
      const c = crepeRef.current;
      if (!view || !c || !wrap.current) return;
      const md = c.getMarkdown();
      const count = view.state.doc.childCount;
      let blocks = blockLines(md === baseline.current ? mountProps.current.initial : md);
      // the editor keeps an empty paragraph after a trailing rule or list; it has no source line
      const fits = (b: typeof blocks) => b.length === count || (b.length < count && view.state.doc.child(count - 1).content.size === 0 && b.length === count - 1);
      if (!fits(blocks)) blocks = blockLines(md);
      if (!fits(blocks)) {
        blockPos.current = [];
        marksRef.current = [];
        setMarks([]);
        return;
      }
      const top0 = wrap.current.getBoundingClientRect().top;
      const next: LineMark[] = [];
      const pos: number[] = [];
      view.state.doc.forEach((node, offset, i) => {
        if (i >= blocks.length) return;
        const el = view.nodeDOM(offset);
        if (!(el instanceof HTMLElement)) return;
        const r = el.getBoundingClientRect();
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
        pos.push(offset);
        next.push({ line: firstLineRef.current + blocks[i].start - 1, end: firstLineRef.current + blocks[i].end - 1, top: r.top - top0, height: r.height, lineHeight: lh });
      });
      blockPos.current = pos;
      marksRef.current = next;
      setMarks(next);
    };
    measureRef.current = measure;
    void crepe.create().then(() => {
      if (disposed) return;
      crepeRef.current = crepe;
      if (baseline.current === null) baseline.current = crepe.getMarkdown();
      const { restore: draft } = mountProps.current;
      if (draft !== null) crepe.editor.action(replaceAll(draft));
      // Only now can the parent drive the editor (scene jumps, find & replace).
      scheduleMeasure();
      onNavRef.current?.({
        goToLine: (line) => {
          const view = getView();
          const ms = marksRef.current;
          if (!view || !ms.length) return false;
          let i = ms.findIndex((m) => line <= m.end);
          if (i === -1) i = ms.length - 1;
          const target = blockPos.current[i];
          view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(target), 1)).scrollIntoView());
          view.focus();
          const el = view.nodeDOM(target);
          if (el instanceof HTMLElement) el.scrollIntoView({ block: 'center' });
          return true;
        },
        find: findApiFor(getView),
        go: (dir) => {
          const view = getView();
          if (!view) return false;
          const { doc, selection } = view.state;
          // a scene starts at the block right after each horizontal rule (`* * *`, `---`)
          const starts: number[] = [];
          doc.forEach((node, offset) => {
            const end = offset + node.nodeSize;
            if (node.type.name === 'hr' && end < doc.content.size) starts.push(end);
          });
          const $from = selection.$from;
          const blockStart = $from.depth >= 1 ? $from.before(1) : $from.pos;
          const target = pickScene(starts, blockStart, dir);
          if (target === null) return false;
          view.dispatch(view.state.tr.setSelection(Selection.near(doc.resolve(target), 1)).scrollIntoView());
          view.focus();
          const el = view.nodeDOM(target);
          if (el instanceof HTMLElement) el.scrollIntoView({ block: 'center' });
          return true;
        }
      });
    });

    return () => {
      onNavRef.current?.(null);
      disposed = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      crepeRef.current = null;
      void crepe.destroy();
    };
  }, []);

  useEffect(() => {
    if (!saved || !crepeRef.current) return;
    baseline.current = saved.markdown;
    const current = crepeRef.current.getMarkdown();
    onChangeRef.current(current === saved.markdown ? null : current);
  }, [saved?.version]);

  useEffect(() => measureRef.current(), [firstLine]);

  return (
    <div className="editor-wrap" ref={wrap}>
      <div className="editor" ref={host} />
      <LineGutter marks={marks} scroll={0} host={wrap} />
    </div>
  );
}
