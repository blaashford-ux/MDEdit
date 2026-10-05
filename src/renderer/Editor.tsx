import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { useEffect, useRef } from 'react';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/classic.css';

interface Props {
  /** Markdown to load. Read once on mount: remount (via `key`) to load a different chapter. */
  initial: string;
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

export function Editor({ initial, onChange, saved }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const baseline = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialRef = useRef(initial);

  useEffect(() => {
    const crepe = new Crepe({
      root: host.current,
      defaultValue: initialRef.current,
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
