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
  const share = new ReviewShare({ fs: ownerFs, drive, stateFile: '/state/shares.json', newId: () => `rev${++n}abcdef` });
  const readerFs = new MemoryFs();
  const join = new ReviewJoin({ fs: readerFs, drive, sharedRoot: '/root/Shared With Me' });
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

  it('gives the reviewer new text, and drops files the owner removed', async () => {
    const { drive, share, ownerFs, readerFs, join } = setup();
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
    expect(await readerFs.readText(`${joined.dir}/Extra.md`)).toBe('more');
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
});
