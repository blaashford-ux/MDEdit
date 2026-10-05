import { promises as fs } from 'node:fs';
import { basename } from 'node:path';
import { sanitizeBookDetails, defaultBookDetails, type BookDetails } from '../../src/shared/export/model';
import { sidecarPathFor, stemOf } from '../../src/shared/export/sidecar';
import { writeFileAtomic } from '../files';

export interface LoadedDetails {
  details: BookDetails;
  /** False when no sidecar exists yet (the details are fresh defaults). */
  exists: boolean;
  /** True when the file was unreadable/corrupt; it is backed up before the next save. */
  damaged: boolean;
}

const seedFor = (mdPath: string) => ({ title: stemOf(basename(mdPath)) });

export async function loadDetails(mdPath: string): Promise<LoadedDetails> {
  const file = sidecarPathFor(mdPath);
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { details: defaultBookDetails({ ...seedFor(mdPath), author: '' }), exists: false, damaged: false };
    }
    throw e;
  }
  try {
    return { details: sanitizeBookDetails(JSON.parse(text), seedFor(mdPath)), exists: true, damaged: false };
  } catch {
    return { details: defaultBookDetails({ ...seedFor(mdPath), author: '' }), exists: true, damaged: true };
  }
}

/** Saves atomically. A damaged existing file is kept as `.bak` first, never silently overwritten. */
export async function saveDetails(mdPath: string, details: BookDetails): Promise<void> {
  const file = sidecarPathFor(mdPath);
  try {
    JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') await fs.copyFile(file, file + '.bak').catch(() => undefined);
  }
  await writeFileAtomic(file, JSON.stringify(sanitizeBookDetails(details, seedFor(mdPath)), null, 2) + '\n');
}

/** Returns whether unreadable existing settings were replaced (their content is kept as `.bak`). */
export async function setMarked(mdPath: string, marked: boolean): Promise<{ backedUp: boolean }> {
  const loaded = await loadDetails(mdPath);
  if (!marked && !loaded.exists) return { backedUp: false }; // nothing to unmark
  await saveDetails(mdPath, { ...loaded.details, marked });
  return { backedUp: loaded.damaged };
}

/** Keeps the sidecar with its manuscript when the file is renamed in the app. */
export async function renameSidecar(oldMd: string, newMd: string): Promise<void> {
  const from = sidecarPathFor(oldMd);
  const to = sidecarPathFor(newMd);
  if (from === to) return;
  try {
    await fs.lstat(from);
  } catch {
    return; // no sidecar
  }
  try {
    await fs.lstat(to);
    return; // never overwrite someone else's export settings
  } catch {
    await fs.rename(from, to);
  }
}

/** Path of the sidecar if one exists (so it can be moved to the Recycle Bin with its manuscript). */
export async function existingSidecar(mdPath: string): Promise<string | null> {
  const p = sidecarPathFor(mdPath);
  try {
    await fs.lstat(p);
    return p;
  } catch {
    return null;
  }
}
