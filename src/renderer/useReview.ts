import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MdeditApi } from '../shared/api';
import {
  newReviewFile,
  type Anchor,
  parseReviewFile,
  serializeReviewFile,
  type ReviewFile,
  type ReviewItem
} from '../shared/review/comments';
import type { NoteMark, ReviewApi } from './reviewPlugin';

export interface Identity {
  id: string;
  name: string;
}

const KEY = 'mdedit.reviewer';

/** Who is writing the notes on this device. The owner's own notes use the id "owner". */
export function loadIdentity(): Identity {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Identity | null;
    if (v && typeof v.id === 'string' && typeof v.name === 'string') return v;
  } catch {
    /* no storage: fall through */
  }
  return { id: 'owner', name: 'Me' };
}

export function saveIdentity(i: Identity): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(i));
  } catch {
    /* ignore */
  }
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export interface ShownItem extends ReviewItem {
  /** Whose file it lives in. */
  reviewerId: string;
  reviewerName: string;
}

export interface ReviewState {
  items: ShownItem[];
  /** Notes whose text can't be found in the open chapter. */
  detached: Set<string>;
  /** Saves a note on a selection captured earlier with `selection()`. */
  add(sel: { anchor: Anchor; oneBlock: boolean }, kind: 'comment' | 'suggestion', body: string, replacement?: string): void;
  selection(): { anchor: Anchor; oneBlock: boolean } | null;
  setStatus(id: string, status: ReviewItem['status']): Promise<void>;
  reply(id: string, body: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** Puts a suggestion's text into the chapter and marks it accepted; returns an error message if it can't. */
  accept(id: string): Promise<string | null>;
  focus(id: string): void;
  /** Reads the review files again (after another device's notes arrived). */
  reload(): void;
}

/**
 * The review notes for the open file: loaded from the project's review files, drawn in the editor, and saved back to
 * whichever reviewer's file each note lives in.
 */
export function useReview(
  api: Pick<MdeditApi, 'listReviews' | 'saveReview'>,
  project: string | null,
  file: string | null,
  review: ReviewApi | undefined,
  me: Identity,
  chapterKey: string
): ReviewState {
  const [files, setFiles] = useState<Map<string, ReviewFile>>(new Map());
  const [detached, setDetached] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);
  const filesRef = useRef(files);
  filesRef.current = files;

  useEffect(() => {
    let live = true;
    if (!project) {
      setFiles(new Map());
      return;
    }
    void api.listReviews(project).then((list) => {
      if (!live) return;
      const m = new Map<string, ReviewFile>();
      for (const { id, text } of list) {
        const f = parseReviewFile(text);
        if (f) m.set(id, f);
      }
      setFiles(m);
    }).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, project, tick]);

  useEffect(() => setFiles(new Map()), [project]);

  const items = useMemo<ShownItem[]>(() => {
    const out: ShownItem[] = [];
    for (const [id, f] of files) for (const i of f.items) if (i.file === file && i.status !== 'deleted') out.push({ ...i, reviewerId: id, reviewerName: f.reviewer.name });
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [files, file]);

  // Draw the open notes in the editor (resolved and rejected ones fade out of the text).
  useEffect(() => {
    if (!review) return;
    const marks: NoteMark[] = items.filter((i) => i.status === 'open').map((i) => ({ id: i.id, anchor: i.anchor, kind: i.kind }));
    const { detached: lost } = review.setNotes(marks);
    setDetached(new Set(lost));
  }, [review, items, chapterKey]);

  const write = useCallback(
    async (reviewerId: string, change: (f: ReviewFile) => ReviewFile) => {
      if (!project) return;
      const current = filesRef.current.get(reviewerId) ?? newReviewFile(project, { id: me.id, name: me.name });
      const next = change(current);
      setFiles((prev) => new Map(prev).set(reviewerId, next));
      filesRef.current = new Map(filesRef.current).set(reviewerId, next);
      await api.saveReview(project, reviewerId, serializeReviewFile(next));
    },
    [api, project, me.id, me.name]
  );

  const ownerOf = (id: string) => items.find((i) => i.id === id)?.reviewerId;
  const touch = (i: ReviewItem, patch: Partial<ReviewItem>): ReviewItem => ({ ...i, ...patch, updatedAt: new Date().toISOString() });
  const edit = (id: string, patch: (i: ReviewItem) => ReviewItem) => {
    const owner = ownerOf(id);
    if (!owner) return Promise.resolve();
    return write(owner, (f) => ({ ...f, items: f.items.map((i) => (i.id === id ? patch(i) : i)) }));
  };

  return {
    items,
    detached,
    selection: () => review?.selection() ?? null,
    add(sel, kind, body, replacement) {
      if (!file || (kind === 'suggestion' && !sel.oneBlock)) return;
      const now = new Date().toISOString();
      const item: ReviewItem = {
        id: uid(),
        kind,
        file,
        anchor: sel.anchor,
        body,
        ...(kind === 'suggestion' ? { replacement: replacement ?? '' } : {}),
        status: 'open',
        author: me.name,
        createdAt: now,
        updatedAt: now,
        replies: []
      };
      void write(me.id, (f) => ({ ...f, reviewer: { id: me.id, name: me.name }, items: [...f.items, item] }));
    },
    setStatus: (id, status) => edit(id, (i) => touch(i, { status })),
    reply: (id, body) =>
      edit(id, (i) => touch(i, { replies: [...i.replies, { id: uid(), author: me.name, createdAt: new Date().toISOString(), body }] })),
    remove: (id) => edit(id, (i) => touch(i, { status: 'deleted' })),
    async accept(id) {
      const item = items.find((i) => i.id === id);
      if (!item || item.kind !== 'suggestion' || item.replacement === undefined) return 'That is not a suggestion.';
      if (!review?.replace(id, item.replacement)) return 'The text has changed since this was suggested, so it can’t be applied here.';
      await edit(id, (i) => touch(i, { status: 'accepted' }));
      return null;
    },
    focus: (id) => void review?.reveal(id),
    reload: () => setTick((t) => t + 1)
  };
}
