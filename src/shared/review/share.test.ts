import { describe, expect, it } from 'vitest';
import { MemoryFs } from '../memoryFs';
import { FakeDrive } from '../sync/fakeDrive';
import { makeReviews } from '../backend/reviews';
import { makeAnchor, parseReviewFile, serializeReviewFile, type ReviewItem } from './comments';
import { parseInviteLink } from './link';
import { ReviewJoin, ReviewShare } from './share';

const note = (id: string, over: Partial<ReviewItem> = {}): ReviewItem => ({
  id, kind: 'comment', file: 'Manuscript/Book.md', anchor: makeAnchor('Hello there', 0, 5), body: 'nice', status: 'open',
  author: 'Sam', createdAt: '2026-10-07T10:00:00Z', updatedAt: '2026-10-07T10:00:00Z', replies: [], ...over,
});

function setup() {
  const drive = new FakeDrive();
  const ownerFs = new MemoryFs();
  ownerFs.seed('/root/Novel/Manuscript/Book.md', '# One\n\nHello there\n');
  ownerFs.seed('/root/Novel/Manuscript/Book.export.json', '{}');
  ownerFs.seed('/root/Novel/.mdedit/project.json', '{}');
  ownerFs.seed('/root/Novel/Exports/Book.epub', 'x');
  let n = 0;
  const share = new ReviewShare({ fs: ownerFs, drive: () => drive, stateFile: '/state/shares.json', newId: () => `rev${++n}abcdef` });
  const readerFs = new MemoryFs();
  const join = new ReviewJoin({ fs: readerFs, drive: () => drive, sharedRoot: '/root/Shared With Me' });
  return { drive, ownerFs, share, readerFs, join };
}

describe('sharing a project for review', () => {
  it('publishes only the prose, as a link-readable file beside (not inside) the sync folder', async () => {
    const { drive, share } = setup();
    const rec = await share.publish('/root/Novel', 'Novel');
    const pkg = JSON.parse(await drive.download(rec.packageId));
    expect(pkg.files.map((f: { path: string }) => f.path)).toEqual(['Manuscript/Book.md']);
    expect(drive.links.get(rec.packageId)).toBe('reader');
    const all = await drive.listAll();
    expect(all.find((f) => f.id === rec.packageId)?.parentId).toBe(all.find((f) => f.name === 'MDEdit Reviews')?.id);
  });

  it('does not upload again when nothing changed, and updates in place when it did', async () => {
    const { drive, ownerFs, share } = setup();
    const a = await share.publish('/root/Novel', 'Novel');
    const b = await share.publish('/root/Novel', 'Novel');
    expect(b.packageId).toBe(a.packageId);
    expect(drive.calls.filter((c) => c.startsWith('updateFile'))).toHaveLength(0);
    ownerFs.seed('/root/Novel/Manuscript/Book.md', '# One\n\nChanged\n');
    await share.publish('/root/Novel', 'Novel');
    expect(drive.calls.filter((c) => c.startsWith('updateFile'))).toHaveLength(1);
  });

  it('invites a reviewer with their own writable file and a link that parses', async () => {
    const { drive, share } = setup();
    const r = await share.invite('/root/Novel', 'Novel', 'Sam');
    expect(drive.links.get(r.commentsId)).toBe('writer');
    expect(parseInviteLink(r.link)).toMatchObject({ commentsId: r.commentsId, reviewerId: r.id, project: 'Novel' });
    expect((await share.status('Novel')).reviewers.map((x) => x.name)).toEqual(['Sam']);
  });

  it('carries notes both ways between reviewer and owner', async () => {
    const { drive, share, ownerFs, readerFs, join } = setup();
    const inv = await share.invite('/root/Novel', 'Novel', 'Sam');
    const invite = parseInviteLink(inv.link)!;

    drive.granted = new Set([invite.packageId, invite.commentsId]); // what the picker grants the reviewer
    const joined = await join.join(invite, 'Sam');
    expect(await readerFs.readText(`${joined.dir}/Manuscript/Book.md`)).toContain('Hello there');
    expect((await join.list())[0].project).toBe('Novel');

    // the reviewer comments, then syncs
    const reviews = makeReviews(readerFs);
    const mine = parseReviewFile((await reviews.list(joined.dir))[0].text)!;
    await reviews.save(joined.dir, joined.reviewerId, serializeReviewFile({ ...mine, items: [note('n1')] }));
    await join.sync(joined.dir);

    // the owner pulls it, replies, and the reviewer sees the reply
    drive.granted = null;
    const pulled = await share.pull('/root/Novel', 'Novel');
    expect(pulled.changed).toBe(true);
    const ownerCopy = parseReviewFile((await makeReviews(ownerFs).list('/root/Novel')).find((r) => r.id === inv.id)!.text)!;
    expect(ownerCopy.items.map((i) => i.id)).toEqual(['n1']);
    await makeReviews(ownerFs).save('/root/Novel', inv.id, serializeReviewFile({ ...ownerCopy, items: [{ ...ownerCopy.items[0], status: 'resolved', updatedAt: '2026-10-07T12:00:00Z' }] }));
    await share.pull('/root/Novel', 'Novel');

    drive.granted = new Set([invite.packageId, invite.commentsId]);
    const res = await join.sync(joined.dir);
    expect(res.changed).toBe(true);
    const back = parseReviewFile((await reviews.list(joined.dir))[0].text)!;
    expect(back.items[0].status).toBe('resolved');
  });

  it('gives the reviewer new text, but never the project’s other files', async () => {
    const { drive, share, ownerFs, readerFs, join } = setup();
    ownerFs.seed('/root/Novel/.mdedit/project.json', JSON.stringify({ version: 1, name: 'Novel', activeManuscript: 'Manuscript/Book.md' }));
    const inv = await share.invite('/root/Novel', 'Novel', 'Sam');
    const invite = parseInviteLink(inv.link)!;
    drive.granted = new Set([invite.packageId, invite.commentsId]);
    const joined = await join.join(invite, 'Sam');
    drive.granted = null;
    ownerFs.seed('/root/Novel/Manuscript/Book.md', '# One\n\nRewritten\n');
    ownerFs.seed('/root/Novel/Extra.md', 'more');
    await share.sync('/root/Novel', 'Novel');
    drive.granted = new Set([invite.packageId, invite.commentsId]);
    await join.sync(joined.dir);
    expect(await readerFs.readText(`${joined.dir}/Manuscript/Book.md`)).toContain('Rewritten');
    expect(await readerFs.stat(`${joined.dir}/Extra.md`)).toBeNull();
  });

  it('joins the same invitation into the same folder, and refuses when access was not granted', async () => {
    const { drive, share, join } = setup();
    const inv = await share.invite('/root/Novel', 'Novel', 'Sam');
    const invite = parseInviteLink(inv.link)!;
    drive.granted = new Set();
    await expect(join.join(invite, 'Sam')).rejects.toThrow(/can’t open/);
    drive.granted = new Set([invite.packageId, invite.commentsId]);
    const a = await join.join(invite, 'Sam');
    const b = await join.join(invite, 'Sam');
    expect(b.dir).toBe(a.dir);
  });

  it('revoking closes the reviewer’s file, keeps their notes, and unshares the package with the last one', async () => {
    const { drive, share, ownerFs } = setup();
    const a = await share.invite('/root/Novel', 'Novel', 'Sam');
    const pkgId = (await share.status('Novel')).reviewers.length && (await drive.listAll()).find((f) => f.name.endsWith('mdedit-review.json'))!.id;
    await share.revoke('/root/Novel', 'Novel', a.id);
    expect(drive.links.has(a.commentsId)).toBe(false);
    expect(drive.links.has(pkgId as string)).toBe(false);
    expect((await share.status('Novel')).reviewers).toEqual([]);
    expect((await makeReviews(ownerFs).list('/root/Novel')).some((r) => r.id === a.id)).toBe(true);
  });

  it('reports that access was withdrawn', async () => {
    const { drive, share, join } = setup();
    const inv = await share.invite('/root/Novel', 'Novel', 'Sam');
    const invite = parseInviteLink(inv.link)!;
    drive.granted = new Set([invite.packageId, invite.commentsId]);
    const joined = await join.join(invite, 'Sam');
    drive.granted = new Set();
    expect(await join.sync(joined.dir)).toEqual({ changed: false, revoked: true });
  });

  it('shares the package again when a new reviewer is invited after the last one was removed', async () => {
    const { drive, share } = setup();
    const a = await share.invite('/root/Novel', 'Novel', 'Sam');
    const packageId = parseInviteLink(a.link)!.packageId;
    await share.revoke('/root/Novel', 'Novel', a.id);
    expect(drive.links.has(packageId)).toBe(false); // the last reviewer is gone, so the package is closed
    const b = await share.invite('/root/Novel', 'Novel', 'Mihael');
    expect(parseInviteLink(b.link)!.packageId).toBe(packageId); // the same package is re-used...
    expect(drive.links.get(packageId)).toBe('reader'); // ...so it has to be opened again
  });

  it('repairs an invitation whose package was left private, when the owner next exchanges notes', async () => {
    const { drive, ownerFs, share } = setup();
    const a = await share.invite('/root/Novel', 'Novel', 'Sam');
    const packageId = parseInviteLink(a.link)!.packageId;
    await drive.unshare(packageId); // how existing invitations were left
    const later = new ReviewShare({ fs: ownerFs, drive: () => drive, stateFile: '/state/shares.json' }); // the next time the app runs
    const r = await later.pull('/root/Novel', 'Novel');
    expect(r.errors).toEqual([]);
    expect(drive.links.get(packageId)).toBe('reader');
    drive.calls.length = 0;
    await later.pull('/root/Novel', 'Novel');
    expect(drive.calls.filter((c) => c.startsWith('share:'))).toEqual([]); // checked once per session, not every minute
  });

  it('lists the shared projects and can remove every reviewer at once', async () => {
    const { share, drive } = setup();
    expect(await share.list()).toEqual([]);
    const a = await share.invite('/root/Novel', 'Novel', 'Sam');
    const b = await share.invite('/root/Novel', 'Novel', 'Alex');
    const listed = await share.list();
    expect(listed.map((x) => [x.project, x.reviewers.length])).toEqual([['Novel', 2]]);
    await share.revokeAll('/root/Novel', 'Novel');
    expect(await share.list()).toEqual([]);
    expect(drive.links.has(a.commentsId) || drive.links.has(b.commentsId)).toBe(false);
  });
});

describe('what reviewers can see', () => {
  const twoBooks = () => {
    const t = setup();
    t.ownerFs.seed('/root/Novel/Manuscript/Other Book.md', '# Secret\n\nNot for reviewers\n');
    t.ownerFs.seed('/root/Novel/Notes/Plot.md', '# Plot\n\nSpoilers\n');
    return t;
  };
  const withActive = (t: ReturnType<typeof setup>, active: string | null) =>
    t.ownerFs.seed('/root/Novel/.mdedit/project.json', JSON.stringify({ version: 1, name: 'Novel', activeManuscript: active }));

  it('only the active manuscript goes in the package', async () => {
    const t = twoBooks();
    withActive(t, 'Manuscript/Book.md');
    const rec = await t.share.publish('/root/Novel', 'Novel');
    const pkg = JSON.parse(await t.drive.download(rec.packageId));
    expect(pkg.files.map((f: { path: string }) => f.path)).toEqual(['Manuscript/Book.md']);
  });

  it('refuses to share a project with several files until one is chosen, and says what to do', async () => {
    const t = twoBooks();
    await expect(t.share.invite('/root/Novel', 'Novel', 'Sam')).rejects.toThrow(/Active Manuscript/);
    expect((await t.drive.listAll()).filter((f) => f.name.endsWith('.comments.json'))).toHaveLength(0);
  });

  it('says so when the chosen file is gone', async () => {
    const t = twoBooks();
    withActive(t, 'Manuscript/Missing.md');
    await expect(t.share.publish('/root/Novel', 'Novel')).rejects.toThrow(/isn’t in this project/);
  });

  it('a reviewer who joined earlier loses the other files when the owner narrows it down', async () => {
    const t = twoBooks();
    withActive(t, 'Manuscript/Other Book.md');
    const inv = await t.share.invite('/root/Novel', 'Novel', 'Sam');
    const invite = parseInviteLink(inv.link)!;
    t.drive.granted = new Set([invite.packageId, invite.commentsId]);
    const joined = await t.join.join(invite, 'Sam');
    expect(await t.readerFs.stat(`${joined.dir}/Manuscript/Other Book.md`)).not.toBeNull();
    expect(await t.readerFs.stat(`${joined.dir}/Notes/Plot.md`)).toBeNull();

    withActive(t, 'Manuscript/Book.md');
    t.drive.granted = null;
    await t.share.publish('/root/Novel', 'Novel');
    t.drive.granted = new Set([invite.packageId, invite.commentsId]);
    await t.join.sync(joined.dir);
    expect(await t.readerFs.stat(`${joined.dir}/Manuscript/Book.md`)).not.toBeNull();
    expect(await t.readerFs.stat(`${joined.dir}/Manuscript/Other Book.md`)).toBeNull();
  });
});

describe('the owner on two devices', () => {
  function devices() {
    const drive = new FakeDrive();
    const mk = (n: string) => {
      const fs = new MemoryFs();
      fs.seed('/root/Novel/Manuscript/Book.md', '# One\n\nHello there\n');
      fs.seed('/root/Novel/.mdedit/project.json', '{}');
      let clock = Date.parse('2026-10-12T10:00:00Z');
      let c = 0;
      const share = new ReviewShare({ fs, drive: () => drive, stateFile: `/state-${n}/shares.json`, newId: () => `${n}${++c}abcdefgh`, now: () => new Date((clock += 120_000)) });
      return { fs, share };
    };
    return { drive, pc: mk('pc'), phone: mk('ph') };
  }

  it('the phone shows what the PC shared, and the other way round', async () => {
    const { pc, phone } = devices();
    const sam = await pc.share.invite('/root/Novel', 'Novel', 'Sam');
    expect((await phone.share.status('Novel')).reviewers.map((r) => r.name)).toEqual(['Sam']);
    expect((await phone.share.list()).map((s) => s.project)).toEqual(['Novel']);
    const kim = await phone.share.invite('/root/Novel', 'Novel', 'Kim');
    expect((await pc.share.status('Novel')).reviewers.map((r) => r.name).sort()).toEqual(['Kim', 'Sam']);
    expect(kim.link).not.toBe(sam.link);
  });

  it('the phone can pull a reviewer’s notes on its own', async () => {
    const { drive, pc, phone } = devices();
    const inv = await pc.share.invite('/root/Novel', 'Novel', 'Sam');
    // the reviewer writes a note straight into their comments file
    const file = newReview('Novel', inv.id, 'Sam', [note('n1')]);
    await drive.updateFile(inv.commentsId, file);
    const r = await phone.share.sync('/root/Novel', 'Novel');
    expect(r.errors).toEqual([]);
    const saved = (await makeReviews(phone.fs).list('/root/Novel')).find((x) => x.id === inv.id)!;
    expect(parseReviewFile(saved.text)!.items.map((i) => i.id)).toEqual(['n1']);
  });

  it('a reviewer removed on one device stays removed on the other', async () => {
    const { pc, phone } = devices();
    const sam = await pc.share.invite('/root/Novel', 'Novel', 'Sam');
    await phone.share.status('Novel');
    await phone.share.revoke('/root/Novel', 'Novel', sam.id);
    expect((await pc.share.status('Novel')).shared).toBe(false);
    // and a stale copy of the list can't bring them back
    const again = await pc.share.invite('/root/Novel', 'Novel', 'Kim');
    expect((await phone.share.status('Novel')).reviewers.map((r) => r.id)).toEqual([again.id]);
  });

  it('works offline: each device keeps its own record when Drive can’t be reached', async () => {
    const { drive, pc } = devices();
    const sam = await pc.share.invite('/root/Novel', 'Novel', 'Sam');
    const orig = drive.listAll.bind(drive);
    const origGet = drive.getFile.bind(drive);
    drive.listAll = async () => { throw new Error('offline'); };
    drive.getFile = async () => { throw new Error('offline'); };
    expect((await pc.share.status('Novel')).reviewers.map((r) => r.id)).toEqual([sam.id]);
    drive.listAll = orig;
    drive.getFile = origGet;
  });
});

function newReview(project: string, id: string, name: string, items: ReviewItem[]): string {
  return serializeReviewFile({ version: 1, reviewer: { id, name }, project, items });
}
