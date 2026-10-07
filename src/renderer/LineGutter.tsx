import { memo, useEffect, useState, type RefObject } from 'react';
import type { BlockLines } from '../shared/lines';

/** One numbered line of the file, and where it sits in the editor. */
export interface LineMark {
  /** The file line (1-based). */
  line: number;
  /** Vertical position in the editor's content (px) and the height of one text line, for alignment. */
  top: number;
  lineHeight: number;
}

/** A block of the formatted editor: the file lines it covers and where it is drawn. */
export interface PlacedBlock extends BlockLines {
  top: number;
  height: number;
  lineHeight: number;
}

/**
 * A position for every line of the file, blank lines included, from where the formatted editor draws its blocks.
 * Lines of a block share its height; the blank lines between two blocks share the space between them.
 * `firstLine` is the file line that line 1 of the blocks' own numbering is.
 */
export function lineMarksFromBlocks(blocks: PlacedBlock[], firstLine: number): LineMark[] {
  const out: LineMark[] = [];
  const at = (n: number) => firstLine + n - 1;
  blocks.forEach((b, i) => {
    const n = b.end - b.start + 1;
    for (let k = 0; k < n; k++) out.push({ line: at(b.start + k), top: b.top + (b.height / n) * k, lineHeight: b.lineHeight });
    const next = blocks[i + 1];
    if (!next) return;
    const blanks = next.start - b.end - 1;
    if (blanks <= 0) return;
    const bottom = b.top + b.height;
    const share = (next.top - bottom) / blanks;
    for (let k = 0; k < blanks; k++) out.push({ line: at(b.end + 1 + k), top: bottom + share * k + (share - b.lineHeight) / 2, lineHeight: b.lineHeight });
  });
  return out;
}

/** Index of the line at vertical position `y` (the last one starting at or above it), or -1. */
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
  if (found >= 0 && found === marks.length - 1 && y > marks[found].top + marks[found].lineHeight * 2) return -1; // well below the last line
  return found;
}

interface Props {
  marks: LineMark[];
  /** How far the content is scrolled inside `host` (0 when the page itself scrolls). */
  scroll: number;
  /** The element whose pointer movement picks the hovered line. */
  host: RefObject<HTMLElement>;
}

/** Every line's number, drawn once. Multiples of 10 are always visible; the rest fade in while the pointer is over the editor. */
const Numbers = memo(function Numbers({ marks }: { marks: LineMark[] }) {
  return (
    <>
      {marks.map((m) => (
        <span key={m.line} className={`line-no${m.line % 10 === 0 ? ' ten' : ''}`} style={{ top: m.top, height: m.lineHeight, lineHeight: `${m.lineHeight}px` }}>
          {m.line}
        </span>
      ))}
    </>
  );
});

/**
 * Line numbers in the right-hand margin, outside the text. Every line has its number; every tenth is always shown,
 * the others appear while the pointer is over the editor, and the line under the pointer is picked out. Purely
 * visual: it never takes pointer events.
 */
export function LineGutter({ marks, scroll, host }: Props) {
  const [hover, setHover] = useState(-1);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const move = (e: MouseEvent) => {
      setOver(true);
      setHover(markAt(marks, e.clientY - el.getBoundingClientRect().top + scroll));
    };
    const leave = () => {
      setOver(false);
      setHover(-1);
    };
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', leave);
    return () => {
      el.removeEventListener('mousemove', move);
      el.removeEventListener('mouseleave', leave);
    };
  }, [host, marks, scroll]);

  const hovered = hover >= 0 ? marks[hover] : undefined;
  return (
    <div className={`line-gutter${over ? ' all' : ''}`} aria-hidden="true">
      <div style={{ transform: `translateY(${-scroll}px)` }}>
        <Numbers marks={marks} />
        {hovered && (
          <span className="line-no one" style={{ top: hovered.top, height: hovered.lineHeight, lineHeight: `${hovered.lineHeight}px` }}>
            {hovered.line}
          </span>
        )}
      </div>
    </div>
  );
}
