/** The invitation link a reviewer opens in MDEdit. It carries only Drive file ids and a display name. */
export interface Invite {
  /** The shared package (the manuscript snapshot). */
  packageId: string;
  /** The reviewer's own comments file. */
  commentsId: string;
  reviewerId: string;
  project: string;
}

/** Where the small page that hands the link to MDEdit (and runs Google's file picker) is published. */
export const JOIN_PAGE = 'https://blaashford-ux.github.io/MDEdit/join/';

export function buildInviteLink(i: Invite): string {
  const q = new URLSearchParams({ v: '1', p: i.packageId, c: i.commentsId, r: i.reviewerId, n: i.project });
  return `${JOIN_PAGE}#${q}`;
}

/** Reads an invitation pasted as a link (the web page address or an `mdedit:` link). Null when it isn't one. */
export function parseInviteLink(text: string): Invite | null {
  const t = text.trim();
  const at = t.search(/[#?]/);
  if (at < 0 || !/^(https?:\/\/|mdedit:)/i.test(t)) return null;
  const q = new URLSearchParams(t.slice(at + 1));
  const packageId = q.get('p');
  const commentsId = q.get('c');
  const reviewerId = q.get('r');
  const idOk = (s: string | null): s is string => !!s && /^[A-Za-z0-9_-]{2,128}$/.test(s);
  if (!idOk(packageId) || !idOk(commentsId) || !/^[A-Za-z0-9_-]{4,64}$/.test(reviewerId ?? '')) return null;
  return { packageId, commentsId, reviewerId: reviewerId!, project: (q.get('n') ?? 'Shared project').slice(0, 120) };
}
