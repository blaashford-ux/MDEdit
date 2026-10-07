import { createHash } from 'node:crypto';
import { createWriteStream, promises as fsp } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { expectedSha256, isReleaseDownloadUrl, type UpdateInfo, type UpdateProgress } from '../src/shared/update';

export interface DownloadDeps {
  fetchFn: typeof fetch;
  /** Where the installer is saved (created if missing). */
  dir: string;
  onProgress(p: UpdateProgress): void;
}

/**
 * Downloads the release's installer into `dir` and checks it against the release's `SHA256SUMS.txt`. Resolves to the
 * installer's path. A download that fails the check is deleted. Only files from this project's releases are fetched.
 */
export async function downloadInstaller(info: UpdateInfo, deps: DownloadDeps): Promise<string> {
  const asset = info.asset;
  if (!asset) throw new Error('This release has no Windows installer.');
  if (!isReleaseDownloadUrl(asset.url) || (info.sumsUrl && !isReleaseDownloadUrl(info.sumsUrl))) {
    throw new Error('Refusing to download from outside the MDEdit releases.');
  }
  if (path.basename(asset.name) !== asset.name) throw new Error('The installer has an unexpected name.');

  let expected: string | null = null;
  if (info.sumsUrl) {
    const sums = await deps.fetchFn(info.sumsUrl);
    if (sums.ok) expected = expectedSha256(await sums.text(), asset.name);
  }

  await fsp.mkdir(deps.dir, { recursive: true });
  const target = path.join(deps.dir, asset.name);
  const res = await deps.fetchFn(asset.url);
  if (!res.ok || !res.body) throw new Error(`The download failed (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || asset.size || 0;
  let received = 0;
  const hash = createHash('sha256');
  const body = Readable.fromWeb(res.body as never);
  body.on('data', (chunk: Buffer) => {
    hash.update(chunk);
    received += chunk.length;
    deps.onProgress({ received, total });
  });
  try {
    await pipeline(body, createWriteStream(target));
    if (expected && hash.digest('hex') !== expected) throw new Error('The downloaded installer does not match its checksum, so it was not run.');
  } catch (e) {
    await fsp.rm(target, { force: true });
    throw e;
  }
  return target;
}
