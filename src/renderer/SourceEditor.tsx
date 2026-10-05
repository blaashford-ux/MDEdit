import { useEffect, useRef } from 'react';
import { chapterBody } from '../shared/chapters';

interface Props {
  /** The chapter as it is on disk right now. */
  raw: string;
  /** Unsaved text to start from, if any (otherwise the editor starts from `raw`). */
  draft: string | null;
  onChange(markdown: string | null): void;
  /** Bumped after each save so unsaved-ness is re-evaluated against the new on-disk text. */
  savedVersion: number;
}

/** Plain-text editing of one chapter's exact Markdown: nothing is reformatted. */
export function SourceEditor({ raw, draft, onChange, savedVersion }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const rawRef = useRef(raw);
  rawRef.current = raw;

  const report = (value: string) => onChange(chapterBody(value) === chapterBody(rawRef.current) ? null : value);

  useEffect(() => {
    if (ref.current && savedVersion > 0) report(ref.current.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedVersion, raw]);

  return (
    <textarea
      ref={ref}
      className="source-editor"
      spellCheck
      aria-label="Chapter Markdown source"
      defaultValue={draft ?? raw}
      onInput={(e) => report(e.currentTarget.value)}
    />
  );
}
