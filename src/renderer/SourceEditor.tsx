import { useEffect, useRef } from 'react';
import { chapterBody } from '../shared/chapters';
import { sceneTarget } from '../shared/sceneBreaks';
import type { SceneNav } from './sceneNav';

interface Props {
  /** The chapter as it is on disk right now. */
  raw: string;
  /** Unsaved text to start from, if any (otherwise the editor starts from `raw`). */
  draft: string | null;
  onChange(markdown: string | null): void;
  /** Bumped after each save so unsaved-ness is re-evaluated against the new on-disk text. */
  savedVersion: number;
  /** Hands the parent a way to jump between scene breaks (null on unmount). */
  onNav?(nav: SceneNav | null): void;
}

/** Plain-text editing of one chapter's exact Markdown: nothing is reformatted. */
/** Vertical position of the character at `offset`, measured on a hidden copy of the textarea. */
function offsetTop(ta: HTMLTextAreaElement, offset: number): number {
  const cs = getComputedStyle(ta);
  const mirror = document.createElement('div');
  for (const prop of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'borderLeftWidth', 'borderRightWidth', 'tabSize'] as const) {
    mirror.style[prop] = cs[prop];
  }
  mirror.style.cssText += ';position:absolute;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;top:0;left:-9999px;';
  mirror.style.width = `${ta.clientWidth}px`;
  mirror.style.boxSizing = 'content-box';
  mirror.textContent = ta.value.slice(0, offset);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  mirror.remove();
  return top;
}

export function SourceEditor({ raw, draft, onChange, savedVersion, onNav }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const rawRef = useRef(raw);
  const onNavRef = useRef(onNav);
  onNavRef.current = onNav;
  rawRef.current = raw;

  const report = (value: string) => onChange(chapterBody(value) === chapterBody(rawRef.current) ? null : value);

  useEffect(() => {
    if (ref.current && savedVersion > 0) report(ref.current.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedVersion, raw]);

  useEffect(() => {
    onNavRef.current?.({
      go: (dir) => {
        const ta = ref.current;
        if (!ta) return false;
        const target = sceneTarget(ta.value, ta.selectionStart, dir);
        if (target === null) return false;
        ta.focus();
        ta.setSelectionRange(target, target);
        ta.scrollTop = Math.max(0, offsetTop(ta, target) - ta.clientHeight / 3);
        return true;
      }
    });
    return () => onNavRef.current?.(null);
  }, []);

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
