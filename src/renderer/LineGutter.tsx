import { useEffect, useState, type RefObject } from 'react';

/** One numbered stretch of an editor: a source line, or a block of the formatted view. */
export interface LineMark {
  /** First file line (1-based) and last file line this mark covers. */
  line: number;
  end: number;
  /** Position in the editor's content, in px, and the height of the first text line (for alignment). */
  top: number;
  height: number;
  lineHeight: number;
}

/** The multiple of 10 inside the mark's lines, if any: those are the numbers shown all the time. */
export const tenIn = (m: LineMark): number | null => {
  const t = Math.ceil(m.line / 10) * 10;
  return t <= m.end ? t : null;
};

/** Index of the mark at vertical position `y` (the last one starting at or above it), or -1. */
export function markAt(marks: LineMark[], y: number): number {
  let lo = 0;
  let hi = marks.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (marks[mid].top <= y) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found >= 0 && y > marks[found].top + marks[found].height + 40) return -1; // below the last block
  return found;
}

interface Props {
  marks: LineMark[];
  /** How far the content is scrolled inside `host` (0 when the page itself scrolls). */
  scroll: number;
  /** The element whose pointer movement picks the hovered line. */
  host: RefObject<HTMLElement>;
}

/**
 * Line numbers in the left margin: every tenth line in a faint colour, and the number of whichever
 * line the pointer is over. Purely visual: it never takes pointer events.
 */
export function LineGutter({ marks, scroll, host }: Props) {
  const [hover, setHover] = useState(-1);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const move = (e: MouseEvent) => setHover(markAt(marks, e.clientY - el.getBoundingClientRect().top + scroll));
    const leave = () => setHover(-1);
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', leave);
    return () => {
      el.removeEventListener('mousemove', move);
      el.removeEventListener('mouseleave', leave);
    };
  }, [host, marks, scroll]);

  const label = (m: LineMark, n: number, cls: string) => (
    <span key={`${cls}${n}`} className={`line-no ${cls}`} style={{ top: m.top, height: m.lineHeight, lineHeight: `${m.lineHeight}px` }}>
      {n}
    </span>
  );
  const hovered = hover >= 0 ? marks[hover] : undefined;

  return (
    <div className="line-gutter" aria-hidden="true">
      <div style={{ transform: `translateY(${-scroll}px)` }}>
        {marks.map((m) => {
          const t = tenIn(m);
          return t !== null && m !== hovered ? label(m, t, 'ten') : null;
        })}
        {hovered && label(hovered, hovered.line, 'one')}
      </div>
    </div>
  );
}
