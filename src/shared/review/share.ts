/**
 * Sharing a project for review over Google Drive.
 *
 * The owner publishes a snapshot of the project (the "package", readable by anyone with its link) and, for each
 * reviewer, creates a private comments file (writable by anyone with that reviewer's link). Everyone only ever writes
 * files they own or were given the link to, so reviewers can't change the manuscript or see each other's notes.
 */
import { makeReviews } from '../backend/reviews';
import type { FsPort } from '../fsPort';
import { md5Hex } from '../md5';
import { toCompliantName } from '../sync/names';
import { DRIVE_REVIEWS_NAME, type DriveApi } from '../sync/drive';
import { mergeReviewFiles, newReviewFile, parseReviewFile, serializeReviewFile, type ReviewFile } from './comments';
import { buildInviteLink } from './link';
import { buildPackage, parsePackage, readMarker, writeMarker, writePackage } from './package';

export interface ReviewerRecord {
  id: string;
  name: string;
  commentsId: string;
  createdAt: string;
  link: string;
}

export interface ShareRecord {
  packageId: string;
  packageMd5: string | null;
  publishedAt: string | null;
  reviewers: ReviewerRecord[];
}

interface ShareState {
  version: 1;
  folderId: string | null;
  projects: Record<string, ShareRecord>;
}

export interface ShareStatus {
  shared: boolean;
  publishedAt: string | null;
  reviewers: ReviewerRecord[];
}

export interface ShareOptions {
  fs: FsPort;
  drive: DriveApi;
  /** Where this device remembers what it has shared (outside the Root Folder). */
  stateFile: string;
  now?: () => Date;
  newId?: () => string;
}

const randomId = () => Array.from({ length: 10 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');

/** Owner side. */
export class ReviewShare {
  private state: ShareState = { version: 1, folderId: null, projects: {} };
  private loaded = false;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(private readonly o: ShareOptions) {
    this.now = o.now ?? (() => new Date());
    this.newId = o.newId ?? randomId;
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = JSON.parse(await this.o.fs.readText(this.o.stateFile)) as Partial<ShareState>;
      if (raw.version === 1 && raw.projects) this.state = { version: 1, folderId: raw.folderId ?? null, projects: raw.projects };
    } catch {
      /* first run */
    }
  }

  private async save(): Promise<void> {
    await this.o.fs.mkdir(this.o.stateFile.slice(0, this.o.stateFile.lastIndexOf('/')), { recursive: true });
    await this.o.fs.writeText(this.o.stateFile, JSON.stringify(this.state));
  }

  async status(project: string): Promise<ShareStatus> {
    await this.load();
    const r = this.state.projects[project];
    return { shared: !!r && r.reviewers.length > 0, publishedAt: r?.publishedAt ?? null, reviewers: r?.reviewers ?? [] };
  }

  /** The Drive folder that holds shared files, beside (not inside) the sync folder. */
  private async folder(): Promise<string> {
    if (this.state.folderId && (await this.o.drive.getFile(this.state.folderId))) return this.state.folderId;
    const existing = (await this.o.drive.listAll()).find((f) => f.isFolder && f.name === DRIVE_REVIEWS_NAME && f.parentId === null);
    this.state.folderId = existing?.id ?? (await this.o.drive.createFolder(DRIVE_REVIEWS_NAME, null)).id;
    return this.state.folderId;
  }

  /** Uploads the project's current text for reviewers (only when it has changed since the last upload). */
  async publish(dir: string, project: string): Promise<ShareRecord> {
    await this.load();
    const pkg = await buildPackage(this.o.fs, dir, project, this.now);
    // The timestamp would make every snapshot differ; compare the content only.
    const body = JSON.stringify({ ...pkg, publishedAt: '' });
    const md5 = md5Hex(body);
    let rec = this.state.projects[project];
    const stillThere = rec ? await this.o.drive.getFile(rec.packageId) : null;
    if (rec && stillThere && rec.packageMd5 === md5) return rec;

    const text = JSON.stringify(pkg);
    if (rec && stillThere) {
      await this.o.drive.updateFile(rec.packageId, text);
    } else {
      const file = await this.o.drive.createFile(`${toCompliantName(project)}.mdedit-review.json`, await this.folder(), text);
      await this.o.drive.shareByLink(file.id, 'reader');
      rec = { packageId: file.id, packageMd5: null, publishedAt: null, reviewers: rec?.reviewers ?? [] };
    }
    rec = { ...rec!, packageMd5: md5, publishedAt: pkg.publishedAt };
    this.state.projects[project] = rec;
    await this.save();
    return rec;
  }

  /** Adds a reviewer: makes their comments file and returns the link to send them. */
  async invite(dir: string, project: string, reviewerName: string): Promise<ReviewerRecord> {
    await this.load();
    const rec = await this.publish(dir, project);
    const id = this.newId();
    const name = reviewerName.trim() || 'Reviewer';
    const file = await this.o.drive.createFile(
      `${toCompliantName(project)} - ${toCompliantName(name)}.comments.json`,
      await this.folder(),
      serializeReviewFile(newReviewFile(project, { id, name }))
    );
    await this.o.drive.shareByLink(file.id, 'writer');
    const reviewer: ReviewerRecord = {
      id,
      name,
      commentsId: file.id,
      createdAt: this.now().toISOString(),
      link: buildInviteLink({ packageId: rec.packageId, commentsId: file.id, reviewerId: id, project }),
    };
    this.state.projects[project] = { ...rec, reviewers: [...rec.reviewers, reviewer] };
    await this.save();
    return reviewer;
  }

  /** Stops a reviewer: takes their notes (one last time), then closes their file. Their notes stay in the project. */
  async revoke(dir: string, project: string, reviewerId: string): Promise<void> {
    await this.load();
    const rec = this.state.projects[project];
    const who = rec?.reviewers.find((r) => r.id === reviewerId);
    if (!rec || !who) return;
    await this.pull(dir, project).catch(() => undefined);
    await this.o.drive.unshare(who.commentsId).catch(() => undefined);
    const left = rec.reviewers.filter((r) => r.id !== reviewerId);
    if (left.length === 0) await this.o.drive.unshare(rec.packageId).catch(() => undefined);
    this.state.projects[project] = { ...rec, reviewers: left };
    await this.save();
  }

  /** Exchanges notes with every reviewer's file; returns whether anything on this device changed. */
  async pull(dir: string, project: string): Promise<{ changed: boolean; errors: string[] }> {
    await this.load();
    const rec = this.state.projects[project];
    const out = { changed: false, errors: [] as string[] };
    if (!rec) return out;
    const reviews = makeReviews(this.o.fs);
    const local = new Map((await reviews.list(dir)).map((r) => [r.id, r.text]));
    for (const who of rec.reviewers) {
      try {
        const remoteText = await this.o.drive.download(who.commentsId);
        const merged = mergeFiles(parseReviewFile(remoteText), parseReviewFile(local.get(who.id) ?? ''), project, who);
        const text = serializeReviewFile(merged);
        if (text !== local.get(who.id)) {
          await reviews.save(dir, who.id, text);
          out.changed = true;
        }
        if (text !== remoteText) await this.o.drive.updateFile(who.commentsId, text);
      } catch (e) {
        out.errors.push(`${who.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return out;
  }

  /** A full exchange: new text out, notes in and out. */
  async sync(dir: string, project: string): Promise<{ changed: boolean; errors: string[] }> {
    await this.load();
    if (!this.state.projects[project]?.reviewers.length) return { changed: false, errors: [] };
    await this.publish(dir, project);
    return this.pull(dir, project);
  }
}

function mergeFiles(remote: ReviewFile | null, local: ReviewFile | null, project: string, who: { id: string; name: string }): ReviewFile {
  const base = newReviewFile(project, { id: who.id, name: who.name });
  const r = remote ?? base;
  return local ? mergeReviewFiles(r, local) : r;
}

export interface JoinOptions {
  fs: FsPort;
  drive: DriveApi;
  /** Local folder for projects shared with this person ("Shared With Me"). */
  sharedRoot: string;
}

export interface JoinResult {
  /** The local folder the project now lives in. */
  dir: string;
  project: string;
  reviewerId: string;
}

/** Reviewer side. The file picker has already given this app access to the two files by the time these run. */
export class ReviewJoin {
  constructor(private readonly o: JoinOptions) {}

  async join(invite: { packageId: string; commentsId: string; reviewerId: string; project: string }, readerName: string): Promise<JoinResult> {
    const { fs, drive } = this.o;
    const pkgFile = await drive.getFile(invite.packageId);
    const commentsFile = await drive.getFile(invite.commentsId);
    if (!pkgFile || !commentsFile) throw new Error('MDEdit can’t open that project yet. Pick both files when Google asks, or ask the owner to send the link again.');
    const pkg = parsePackage(await drive.download(invite.packageId));
    if (!pkg) throw new Error('That file isn’t a MDEdit review package.');

    const dir = await this.folderFor(invite.reviewerId, toCompliantName(pkg.project));
    const previous = (await readMarker(fs, dir))?.files ?? [];
    const files = await writePackage(fs, dir, pkg, previous);
    await writeMarker(fs, dir, { ...invite, project: pkg.project, packageMd5: pkgFile.md5, files });

    const remote = parseReviewFile(await drive.download(invite.commentsId)) ?? newReviewFile(pkg.project, { id: invite.reviewerId, name: readerName });
    const named: ReviewFile = { ...remote, reviewer: { id: invite.reviewerId, name: readerName || remote.reviewer.name } };
    await makeReviews(fs).save(dir, invite.reviewerId, serializeReviewFile(named));
    if (named.reviewer.name !== remote.reviewer.name) await drive.updateFile(invite.commentsId, serializeReviewFile(named));
    return { dir, project: pkg.project, reviewerId: invite.reviewerId };
  }

  /** The same folder again when this invitation was joined before; otherwise a new, unused name. */
  private async folderFor(reviewerId: string, name: string): Promise<string> {
    const { fs, sharedRoot } = this.o;
    await fs.mkdir(sharedRoot, { recursive: true });
    for (const e of await fs.readdir(sharedRoot)) {
      if (e.isDirectory && (await readMarker(fs, `${sharedRoot}/${e.name}`))?.reviewerId === reviewerId) return `${sharedRoot}/${e.name}`;
    }
    for (let n = 1; ; n++) {
      const candidate = `${sharedRoot}/${n === 1 ? name : `${name} (${n})`}`;
      if (!(await fs.stat(candidate))) return candidate;
    }
  }

  /** Projects shared with this person, as found on disk. */
  async list(): Promise<{ dir: string; project: string; reviewerId: string }[]> {
    const { fs, sharedRoot } = this.o;
    if (!(await fs.stat(sharedRoot))) return [];
    const out: { dir: string; project: string; reviewerId: string }[] = [];
    for (const e of (await fs.readdir(sharedRoot)).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!e.isDirectory) continue;
      const m = await readMarker(fs, `${sharedRoot}/${e.name}`);
      if (m) out.push({ dir: `${sharedRoot}/${e.name}`, project: m.project || e.name, reviewerId: m.reviewerId });
    }
    return out;
  }

  /** Brings the owner's latest text down and exchanges this reviewer's notes. `revoked` when access has been withdrawn. */
  async sync(dir: string): Promise<{ changed: boolean; revoked: boolean }> {
    const { fs, drive } = this.o;
    const m = await readMarker(fs, dir);
    if (!m) throw new Error('That folder is not a shared project.');
    const pkgFile = await drive.getFile(m.packageId);
    const commentsFile = await drive.getFile(m.commentsId);
    if (!pkgFile || !commentsFile) return { changed: false, revoked: true };
    let changed = false;

    if (pkgFile.md5 !== m.packageMd5) {
      const pkg = parsePackage(await drive.download(m.packageId));
      if (pkg) {
        const files = await writePackage(fs, dir, pkg, m.files);
        await writeMarker(fs, dir, { ...m, project: pkg.project, packageMd5: pkgFile.md5, files });
        changed = true;
      }
    }

    const reviews = makeReviews(fs);
    const local = (await reviews.list(dir)).find((r) => r.id === m.reviewerId)?.text ?? '';
    const remoteText = await drive.download(m.commentsId);
    const merged = mergeFiles(parseReviewFile(remoteText), parseReviewFile(local), m.project, { id: m.reviewerId, name: '' });
    const text = serializeReviewFile(merged);
    if (text !== local) {
      await reviews.save(dir, m.reviewerId, text);
      changed = true;
    }
    if (text !== remoteText) await drive.updateFile(m.commentsId, text);
    return { changed, revoked: false };
  }
}
