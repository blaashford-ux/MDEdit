import { describe, expect, it } from 'vitest';
import { splitChapters } from './chapters';
import { blockLines, chapterStartLine, countLines, lineStarts, locateLine, totalLines } from './lines';

const doc = splitChapters('# One\n\nalpha\nbeta\n\n# Two\n\ngamma\n\n# Three\n\ndelta');

describe('line numbers', () => {
  it('counts lines', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a')).toBe(1);
    expect(countLines('a\n')).toBe(1);
    expect(countLines('a\r\nb\r\n')).toBe(2);
    expect(countLines('a\n\nb')).toBe(3);
  });

  it('finds where each chapter starts and the file total', () => {
    expect([0, 1, 2].map((i) => chapterStartLine(doc, i))).toEqual([1, 6, 10]);
    expect(totalLines(doc)).toBe(12);
  });

  it('locates a file line in its chapter', () => {
    expect(locateLine(doc, 1)).toEqual({ chapter: 0, line: 1 });
    expect(locateLine(doc, 5)).toEqual({ chapter: 0, line: 5 });
    expect(locateLine(doc, 6)).toEqual({ chapter: 1, line: 1 });
    expect(locateLine(doc, 12)).toEqual({ chapter: 2, line: 3 });
  });

  it('clamps out-of-range lines', () => {
    expect(locateLine(doc, 0)).toEqual({ chapter: 0, line: 1 });
    expect(locateLine(doc, 999)).toEqual({ chapter: 2, line: 3 });
    expect(locateLine(splitChapters(''), 5).line).toBe(1);
  });

  it('splits blocks on blank lines but not inside code fences', () => {
    expect(blockLines('# T\n\npara\nmore\n\n```\na\n\nb\n```\n\nlast\n')).toEqual([
      { start: 1, end: 1 },
      { start: 3, end: 4 },
      { start: 6, end: 10 },
      { start: 12, end: 12 }
    ]);
  });

  it('lists line start offsets', () => {
    expect(lineStarts('ab\ncd\r\nef')).toEqual([0, 3, 7]);
  });
});
