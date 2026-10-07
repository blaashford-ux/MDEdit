import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UpdateInfo } from '../src/shared/update';
import { downloadInstaller } from './update';

const BASE = 'https://github.com/blaashford-ux/MDEdit/releases/download/v0.5.0/';
const bytes = Buffer.from('pretend installer');
const info = (over: Partial<UpdateInfo> = {}): UpdateInfo => ({
  current: '0.4.3',
  latest: '0.5.0',
  available: true,
  notes: '',
  pageUrl: '',
  asset: { name: 'MDEdit-Setup-0.5.0.exe', url: BASE + 'MDEdit-Setup-0.5.0.exe', size: bytes.length },
  sumsUrl: BASE + 'SHA256SUMS.txt',
  ...over
});
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const server = (sums: string) =>
  (async (url: string) => (String(url).endsWith('SHA256SUMS.txt') ? new Response(sums) : new Response(bytes))) as unknown as typeof fetch;

let dir: string;
beforeEach(async () => void (dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mdedit-upd-'))));
afterEach(async () => fsp.rm(dir, { recursive: true, force: true }));

describe('downloadInstaller', () => {
  it('saves the installer when its checksum matches, reporting progress', async () => {
    const seen: number[] = [];
    const file = await downloadInstaller(info(), { fetchFn: server(`${sha(bytes)}  MDEdit-Setup-0.5.0.exe\n`), dir, onProgress: (p) => seen.push(p.received) });
    expect(await fsp.readFile(file)).toEqual(bytes);
    expect(seen.at(-1)).toBe(bytes.length);
  });
  it('deletes a download that fails the checksum', async () => {
    await expect(downloadInstaller(info(), { fetchFn: server(`${'0'.repeat(64)}  MDEdit-Setup-0.5.0.exe\n`), dir, onProgress: () => undefined })).rejects.toThrow(/checksum/);
    expect(await fsp.readdir(dir)).toEqual([]);
  });
  it('refuses files from anywhere but the project’s releases', async () => {
    const bad = info({ asset: { name: 'x.exe', url: 'https://example.com/x.exe', size: 1 } });
    await expect(downloadInstaller(bad, { fetchFn: server(''), dir, onProgress: () => undefined })).rejects.toThrow(/outside/);
  });
  it('needs an installer in the release', async () => {
    await expect(downloadInstaller(info({ asset: null }), { fetchFn: server(''), dir, onProgress: () => undefined })).rejects.toThrow(/no Windows installer/);
  });
});
