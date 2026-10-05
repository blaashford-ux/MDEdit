import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFileAtomic } from './files';

describe('writeFileAtomic', () => {
  it('overwrites the file, keeps BOM/CRLF, and leaves no temp files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mdedit-'));
    try {
      const f = path.join(dir, 'a.md');
      await writeFile(f, 'old');
      const content = '﻿# Hi\r\nthere\r\n';
      await writeFileAtomic(f, content);
      expect(await readFile(f, 'utf8')).toBe(content);
      expect(await readdir(dir)).toEqual(['a.md']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
