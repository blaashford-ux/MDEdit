import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { replaceAll } from '@milkdown/kit/utils';
import { useEffect, useRef } from 'react';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/classic.css';
import './milkdownDark';

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
}

export function Editor({ initial, restore, onChange, saved }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const baseline = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const mountProps = useRef({ initial, restore });

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

    crepe.on((l) => {
      l.markdownUpdated((_ctx, md) => {
        if (disposed) return;
        // An update before the baseline is known is the editor normalising its input.
        if (baseline.current === null) baseline.current = md;
        onChangeRef.current(md === baseline.current ? null : md);
      });
    });
    void crepe.create().then(() => {
      if (disposed) return;
      crepeRef.current = crepe;
      if (baseline.current === null) baseline.current = crepe.getMarkdown();
      const { restore: draft } = mountProps.current;
      if (draft !== null) crepe.editor.action(replaceAll(draft));
    });

    return () => {
      disposed = true;
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

  return <div className="editor" ref={host} />;
}
