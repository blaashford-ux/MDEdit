import { useEffect, useMemo, useState, type RefObject } from 'react';

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

/** A faint, always-visible number: a multiple of 10, placed where that line sits. */
export interface Ten {
  n: number;
  top: number;
  lineHeight: number;
}

/**
 * Where each multiple of 10 goes. A tenth line that is inside a block sits at that block's top; one that is a blank
 * line between two blocks sits in the gap between them, so the number lines up with where that line really is.
 */
export function tensFor(marks: LineMark[]): Ten[] {
  const out: Ten[] = [];
  if (!marks.length) return out;
  let i = 0;
  const last = marks[marks.length - 1].end;
  for (let n = Math.ceil(marks[0].line / 10) * 10; n <= last; n += 10) {
    while (i < marks.length - 1 && marks[i + 1].line <= n) i++;
    const m = marks[i];
    if (n <= m.end) {
      out.push({ n, top: m.top, lineHeight: m.lineHeight });
      continue;
    }
    const next = marks[i + 1];
    if (!next) break;
    const blanks = next.line - m.end - 1; // blank lines between the two blocks
    const bottom = m.top + m.height;
    const share = (next.top - bottom) / Math.max(1, blanks);
    out.push({ n, top: bottom + share * (n - m.end - 1) + (share - m.lineHeight) / 2, lineHeight: m.lineHeight });
  }
  return out;
}

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
  const tens = useMemo(() => tensFor(marks), [marks]);

  return (
    <div className="line-gutter" aria-hidden="true">
      <div style={{ transform: `translateY(${-scroll}px)` }}>
        {tens.map((x) =>
          hovered && Math.abs(x.top - hovered.top) < hovered.lineHeight ? null : (
            <span key={`t${x.n}`} className="line-no ten" style={{ top: x.top, height: x.lineHeight, lineHeight: `${x.lineHeight}px` }}>
              {x.n}
            </span>
          )
        )}
        {hovered && label(hovered, hovered.line, 'one')}
      </div>
    </div>
  );
}
