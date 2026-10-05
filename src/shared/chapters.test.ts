import { describe, expect, it } from 'vitest';
import { joinChapters, splitChapters, updateChapter } from './chapters';

const titles = (s: string) => splitChapters(s).chapters.map((c) => (c.isPreamble ? '(pre)' : c.title));

describe('splitChapters', () => {
  it('handles empty input', () => {
    const d = splitChapters('');
    expect(d.chapters).toHaveLength(1);
    expect(d.chapters[0].isPreamble).toBe(true);
    expect(joinChapters(d)).toBe('');
  });

  it('treats a file with no H1 as a single preamble chapter', () => {
    expect(titles('just text\n\n## sub\n')).toEqual(['(pre)']);
  });

  it('splits on H1 with a preamble', () => {
    expect(titles('intro\n\n# One\na\n# Two\nb\n')).toEqual(['(pre)', 'One', 'Two']);
  });

  it('has no preamble when the file starts with an H1', () => {
    expect(titles('# One\na\n')).toEqual(['One']);
  });

  it('keeps H2+ inside their chapter', () => {
    const d = splitChapters('# One\n## sub\n### deeper\n# Two\n');
    expect(d.chapters).toHaveLength(2);
    expect(d.chapters[0].raw).toBe('# One\n## sub\n### deeper\n');
  });

  it('ignores # inside fenced code blocks', () => {
    expect(titles('# One\n```\n# not a heading\n```\n~~~\n# nor this\n~~~\n# Two\n')).toEqual(['One', 'Two']);
  });

  it('only closes a fence with a matching, long-enough fence', () => {
    expect(titles('# A\n````\n```\n# inside\n````\n# B\n')).toEqual(['A', 'B']);
  });

  it('ignores # inside YAML front matter', () => {
    expect(titles('---\n# comment\ntitle: x\n---\n# Real\n')).toEqual(['(pre)', 'Real']);
  });

  it('does not treat #hashtag or 4-space-indented # as H1', () => {
    expect(titles('#hashtag\n    # code\n# Real\n')).toEqual(['(pre)', 'Real']);
  });

  it('strips closing hashes and handles empty headings', () => {
    expect(titles('# Title ##\n# \n#\n')).toEqual(['Title', '', '']);
  });

  it('supports Setext H1', () => {
    expect(titles('Intro\n=====\ntext\n\nNext\n===\n')).toEqual(['Intro', 'Next']);
  });

  it('does not treat a list item followed by === as Setext', () => {
    expect(titles('- item\n===\n')).toEqual(['(pre)']);
  });

  it('detects titles with trailing whitespace and up to 3 leading spaces', () => {
    expect(titles('   # Indented  \n')).toEqual(['Indented']);
  });
});

describe('round-trip fidelity', () => {
  const samples = [
    '',
    '\n',
    'no newline at end',
    '# A',
    '# A\n',
    'pre\n# A\r\ntext\r\n# B\r\n',
    '﻿# Bom\ntext\n',
    '---\ntitle: x\n---\n\n# A\n\n```\n# c\n```\n\n# B\n\n\n',
    'A\r# B\r',
    'Setext\n===\nbody\n'
  ];
  it.each(samples)('join(split(x)) === x for %j', (s) => {
    expect(joinChapters(splitChapters(s))).toBe(s);
  });

  it('holds for randomly generated documents', () => {
    const pieces = ['# H\n', '## h2\n', 'text\n', '\n', '```\n', '~~~\n', '# in\n', '---\n', 'T\n', '===\n', '\r\n', '#x', ' '];
    let seed = 42;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let n = 0; n < 500; n++) {
      let s = '';
      for (let k = 0; k < 30; k++) s += pieces[Math.floor(rnd() * pieces.length)];
      expect(joinChapters(splitChapters(s))).toBe(s);
    }
  });
});

describe('updateChapter', () => {
  it('only changes the targeted chapter', () => {
    const src = '# A\r\none\r\n# B\r\ntwo\r\n# C\r\nthree\r\n';
    const d = splitChapters(src);
    const out = updateChapter(d, 1, '# B\nedited\nmore');
    expect(out.chapters[0].raw).toBe(d.chapters[0].raw);
    expect(out.chapters[2].raw).toBe(d.chapters[2].raw);
    expect(joinChapters(out)).toBe('# A\r\none\r\n# B\r\nedited\r\nmore\r\n# C\r\nthree\r\n');
    expect(joinChapters(d)).toBe(src); // original unchanged
  });

  it('keeps the last chapter without forcing a trailing newline', () => {
    const d = splitChapters('# A\nx\n# B\ny');
    expect(joinChapters(updateChapter(d, 1, '# B\nz'))).toBe('# A\nx\n# B\nz');
  });

  it('updates the title when the heading is renamed', () => {
    const d = splitChapters('# A\nx\n');
    expect(updateChapter(d, 0, '# Renamed\nx\n').chapters[0].title).toBe('Renamed');
  });

  it('throws on a bad index', () => {
    expect(() => updateChapter(splitChapters('# A\n'), 5, 'x')).toThrow(RangeError);
  });
});
