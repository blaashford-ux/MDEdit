/**
 * Collaboration: one author's copy of the manuscript kept in step with another's through a Drive file both can write.
 *
 * Each side calls `exchangeCollab` whenever it syncs. It reads the shared file, merges it with the local text (see `merge.ts`)
 * from the text both sides last agreed on, writes the result to the shared file (when it differs) and to the local file, and
 * reports the new agreed text for the caller to remember.
 */
import type { FsPort } from '../fsPort';
import type { DriveApi } from '../sync/drive';
import { mergeManuscript, sameChapters } from './merge';
import { parsePackage, type ReviewPackage } from './package';

export interface CollabInput {
  fs: FsPort;
  drive: DriveApi;
  /** The folder holding this side's copy. */
  dir: string;
  /** The shared file in Drive (a review package that both sides can write). */
  packageId: string;
  /** Heading level that splits chapters, when the shared file doesn't say. */
  level: number;
  /** Chapters this collaborator was given (keys); null when it is the whole manuscript. */
  scope: Set<string> | null;
  /** The text both sides last agreed on, by file path. */
  base: Record<string, string> | null;
  /** Names for the two sides in conflict markers. */
  labels: { local: string; remote: string };
  now: () => Date;
}

export interface CollabResult {
  /** Local files that were rewritten. */
  localChanged: string[];
  /** Whether the shared file was updated. */
  remoteChanged: boolean;
  conflicts: number;
  /** The agreed text after this exchange. */
  base: Record<string, string>;
  /** The shared file is gone or can't be read. */
  gone: boolean;
}

export async function exchangeCollab(o: CollabInput): Promise<CollabResult> {
  for (let attempt = 0; ; attempt++) {
    const file = await o.drive.getFile(o.packageId);
    if (!file) return { localChanged: [], remoteChanged: false, conflicts: 0, base: o.base ?? {}, gone: true };
    const remote = parsePackage(await o.drive.download(o.packageId));
    if (!remote) throw new Error('The shared copy of the manuscript can’t be read.');
    const level = remote.chapterLevel ?? o.level;

    const files: ReviewPackage['files'] = [];
    const writes: { path: string; text: string }[] = [];
    const base: Record<string, string> = {};
    let conflicts = 0;
    let remoteDiffers = false;
    for (const f of remote.files) {
      const local = await o.fs.readText(`${o.dir}/${f.path}`).catch(() => null);
      if (local === null) {
        files.push(f);
        writes.push(f);
        base[f.path] = f.text;
        continue;
      }
      const m = mergeManuscript({ base: o.base?.[f.path] ?? null, local, remote: f.text, level, scope: o.scope, labels: o.labels });
      conflicts += m.conflicts;
      if (m.local !== local) writes.push({ path: f.path, text: m.local });
      if (!sameChapters(m.shared, f.text, level)) remoteDiffers = true;
      files.push({ path: f.path, text: sameChapters(m.shared, f.text, level) ? f.text : m.shared });
      base[f.path] = sameChapters(m.shared, f.text, level) ? f.text : m.shared;
    }

    if (remoteDiffers) {
      // Someone wrote the shared file while this was merging: start again from what they wrote.
      const now = await o.drive.getFile(o.packageId);
      if (now && now.md5 !== file.md5 && attempt < 2) continue;
      await o.drive.updateFile(o.packageId, JSON.stringify({ ...remote, files, publishedAt: o.now().toISOString(), chapterLevel: level }));
    }
    for (const w of writes) {
      const slash = w.path.lastIndexOf('/');
      if (slash > 0) await o.fs.mkdir(`${o.dir}/${w.path.slice(0, slash)}`, { recursive: true });
      await o.fs.writeText(`${o.dir}/${w.path}`, w.text);
    }
    return { localChanged: writes.map((w) => w.path), remoteChanged: remoteDiffers, conflicts, base, gone: false };
  }
}
