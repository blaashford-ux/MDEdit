import { flattenMarkdown } from '../shared/agent/flatten';
import { locateAnchor, type Anchor } from '../shared/review/comments';

/** Notes that match the text around them as well as the quote are better evidence than a bare quote match. */
function contextScore(text: string, a: Anchor, at: number): number {
  const before = text.slice(Math.max(0, at - a.prefix.length), at);
  const after = text.slice(at + a.quote.length, at + a.quote.length + a.suffix.length);
  return (a.prefix && before === a.prefix ? 1 : 0) + (a.suffix && after === a.suffix ? 1 : 0);
}

/**
 * Which chapter of a file each note is in: the chapter whose text still holds the note's quote, the one whose surroundings
 * match best if several do, and the open chapter on a tie. Chapters are given as Markdown (use the unsaved draft for the
 * open one), and are flattened to the plain text notes are anchored to. Null for a note no chapter has the quote of any more.
 */
export function chaptersForNotes(chapters: string[], anchors: Anchor[], preferred: number): (number | null)[] {
  const flats = chapters.map((raw) => flattenMarkdown(raw));
  return anchors.map((anchor) => {
    let best: { index: number; score: number; dist: number } | null = null;
    flats.forEach((flat, index) => {
      const at = locateAnchor(flat, anchor);
      if (!at) return;
      // Still sitting exactly where it was written is evidence too, when the text around it has been edited since.
      const score = contextScore(flat, anchor, at.start) * 2 + (at.start === anchor.start ? 1 : 0);
      const dist = Math.abs(at.start - anchor.start);
      const better = !best || score > best.score || (score === best.score && (index === preferred ? best.index !== preferred : best.index !== preferred && dist < best.dist));
      if (better) best = { index, score, dist };
    });
    return best ? (best as { index: number }).index : null;
  });
}

export function chapterForNote(chapters: string[], anchor: Anchor, preferred: number): number | null {
  return chaptersForNotes(chapters, [anchor], preferred)[0];
}
