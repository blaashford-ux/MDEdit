import { describe, expect, it } from 'vitest';
import { makeAnchor } from '../shared/review/comments';
import { flattenMarkdown } from '../shared/agent/flatten';
import { chapterForNote, chaptersForNotes } from './noteChapter';

const chapters = [
  '# One\n\nShe walked *slowly* to the door.\n\nThe river ran cold.\n',
  '# Two\n\nHe watched the **river** at dusk.\n\nThe river ran cold again.\n',
  '# Three\n\nNothing here.\n',
];
const anchorIn = (chapter: number, quote: string, nth = 0) => {
  const flat = flattenMarkdown(chapters[chapter]);
  let at = -1;
  for (let i = 0; i <= nth; i++) at = flat.indexOf(quote, at + 1);
  return makeAnchor(flat, at, at + quote.length);
};

describe('which chapter a note is in', () => {
  it('finds the chapter that holds the text, through formatting marks', () => {
    expect(chapterForNote(chapters, anchorIn(0, 'walked slowly'), 2)).toBe(0);
    expect(chapterForNote(chapters, anchorIn(1, 'watched the river at dusk'), 0)).toBe(1);
  });

  it('prefers the chapter whose surroundings match when the quote is in several', () => {
    expect(chapterForNote(chapters, anchorIn(0, 'The river ran cold'), 2)).toBe(0);
    expect(chapterForNote(chapters, anchorIn(1, 'The river ran cold'), 0)).toBe(1);
  });

  it('uses the open chapter when nothing tells them apart', () => {
    const bare = { quote: 'river', prefix: '', suffix: '', start: 0 };
    expect(chapterForNote(chapters, bare, 1)).toBe(1);
    expect(chapterForNote(chapters, bare, 0)).toBe(0);
  });

  it('says when the text has gone from every chapter', () => {
    expect(chapterForNote(chapters, { quote: 'a sentence nobody wrote', prefix: '', suffix: '', start: 0 }, 0)).toBeNull();
    expect(chapterForNote([], anchorIn(0, 'river'), 0)).toBeNull();
  });

  it('follows unsaved edits when given the draft of the open chapter', () => {
    const anchor = anchorIn(0, 'walked slowly');
    const moved = [...chapters];
    moved[0] = '# One\n\nThe river ran cold.\n'; // the sentence was cut from chapter 1 ...
    moved[2] = '# Three\n\nShe walked *slowly* to the door.\n'; // ... and pasted into chapter 3, unsaved
    expect(chapterForNote(moved, anchor, 2)).toBe(2);
    expect(chapterForNote(chapters, anchor, 2)).toBe(0); // before the edit it was in chapter 1
  });
});

describe('the same sentence in two chapters', () => {
  const s = 'Juna nodded thoughtfully.';
  const book = [
    '# A\n\nHello there.\n\nThe tea cooled.\n\n' + s + '\n\nMore.\n',
    '# B\n\nHello there.\n\nThe tea cooled.\n\n' + s + '\n\nMore.\n',
  ];
  const noteIn = (i: number) => {
    const flat = flattenMarkdown(book[i]);
    const at = flat.indexOf(s);
    return makeAnchor(flat, at, at + s.length);
  };

  it('shows the note in the chapter that is open, whichever one it is', () => {
    expect(chapterForNote(book, noteIn(0), 0)).toBe(0);
    expect(chapterForNote(book, noteIn(1), 1)).toBe(1);
  });

  it('keeps each note in its own chapter when the open chapter was edited around it', () => {
    const edited = [...book];
    edited[0] = book[0].replace('More.', 'Much more happened afterwards.'); // chapter 1's surroundings changed since the note
    expect(chapterForNote(edited, noteIn(0), 0)).toBe(0);
    expect(chapterForNote(edited, noteIn(1), 0)).toBe(1); // a note made in chapter 2 is not chapter 1's
  });
});

describe('several notes at once', () => {
  it('gives each note its own chapter', () => {
    const s = 'Juna nodded thoughtfully.';
    const book = ['# A\n\nOne.\n\n' + s + '\n\nEnd of A.\n', '# B\n\nTwo.\n\n' + s + '\n\nEnd of B.\n'];
    const at = (i: number) => {
      const f = flattenMarkdown(book[i]);
      const n = f.indexOf(s);
      return makeAnchor(f, n, n + s.length);
    };
    expect(chaptersForNotes(book, [at(0), at(1)], 0)).toEqual([0, 1]);
    expect(chaptersForNotes(book, [at(0), at(1)], 1)).toEqual([0, 1]);
  });
});

describe('the chapter a note was written in', () => {
  const s = 'Juna nodded thoughtfully.';
  const same = ['# A\n\nShe sat.\n\n' + s + '\n\nEnd.\n', '# B\n\nShe sat.\n\n' + s + '\n\nEnd.\n'];
  const titles = ['A', 'B'];
  const f = flattenMarkdown(same[0]);
  const anchor = makeAnchor(f, f.indexOf(s), f.indexOf(s) + s.length);
  const bare = { ...anchor, prefix: '', suffix: '' }; // nothing in the text tells the chapters apart

  it('settles notes the text cannot', () => {
    expect(chapterForNote(same, bare, 0, { index: 1, title: 'B' }, titles)).toBe(1);
    expect(chapterForNote(same, bare, 1, { index: 0, title: 'A' }, titles)).toBe(0);
  });

  it('follows the chapter by name when chapters were inserted before it', () => {
    const grown = ['# New\n\nx\n', ...same];
    expect(chapterForNote(grown, bare, 0, { index: 1, title: 'B' }, ['New', 'A', 'B'])).toBe(2);
  });

  it('ignores the hint when the text is no longer in that chapter', () => {
    const moved = [same[0], '# B\n\nNothing.\n'];
    expect(chapterForNote(moved, bare, 1, { index: 1, title: 'B' }, titles)).toBe(0);
  });
});
