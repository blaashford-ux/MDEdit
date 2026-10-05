import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existingLastFolder, loadSettings, saveSettings } from './settings';

let dir: string;
let file: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mdedit-'));
  file = path.join(dir, 'settings.json');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('settings', () => {
  it('returns defaults when the file is missing or corrupt', async () => {
    expect(await loadSettings(file)).toEqual({});
    await writeFile(file, '{not json');
    expect(await loadSettings(file)).toEqual({});
    await writeFile(file, '{"lastFolder": 42}');
    expect(await loadSettings(file)).toEqual({});
  });

  it('round-trips the last folder', async () => {
    await saveSettings(file, { lastFolder: dir });
    expect(await existingLastFolder(file)).toBe(dir);
  });

  it('ignores a remembered folder that was deleted or is a file', async () => {
    await saveSettings(file, { lastFolder: path.join(dir, 'gone') });
    expect(await existingLastFolder(file)).toBeNull();
    await saveSettings(file, { lastFolder: file });
    expect(await existingLastFolder(file)).toBeNull();
  });
});
