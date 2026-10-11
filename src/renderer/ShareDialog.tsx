import { useEffect, useState } from 'react';
import type { SyncStatus } from '../shared/api';
import { parseReviewFile } from '../shared/review/comments';
import { inviteMessage } from '../shared/review/link';
import type { ShareStatus } from '../shared/review/share';
import { useEscape } from './useEscape';

interface Props {
  project: string;
  projectName: string;
  sync: SyncStatus | null;
  /** Opens the Google Drive dialog, for when this device isn't connected yet. */
  onConnect(): void;
  onClose(): void;
}

const copy = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
};

/** Manage a project's reviewers: one link per person. Copy the plain link or a short invitation message, or withdraw it. */
export function ShareDialog({ project, projectName, sync, onConnect, onClose }: Props) {
  const api = window.mdedit;
  const [status, setStatus] = useState<ShareStatus | null>(null);
  const [counts, setCounts] = useState<Map<string, { open: number; total: number }>>(new Map());
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  useEscape(onClose);

  const load = () => {
    void api.getShareStatus(project).then(setStatus).catch(() => undefined);
    void api
      .listReviews(project)
      .then((list) => {
        const m = new Map<string, { open: number; total: number }>();
        for (const { id, text } of list) {
          const items = (parseReviewFile(text)?.items ?? []).filter((i) => i.status !== 'deleted');
          m.set(id, { open: items.filter((i) => i.status === 'open').length, total: items.length });
        }
        setCounts(m);
      })
      .catch(() => undefined);
  };
  useEffect(load, [project]);

  const connected = sync?.connected === true;

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await f();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      load();
    }
  };

  const copyNote = async (text: string, what: string) => setNote((await copy(text)) ? `${what} copied.` : 'Couldn’t copy to the clipboard.');

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal share-dialog" role="dialog" aria-modal="true" aria-label="Share for review">
        <h3>Share “{projectName}” for review</h3>
        {!connected ? (
          <>
            <p className="modal-hint">Reviewers get their invitations through Google Drive. Connect Google Drive first.</p>
            <div className="modal-actions">
              <button type="button" onClick={onClose}>Close</button>
              <button type="button" className="primary" onClick={onConnect}>Connect Google Drive…</button>
            </div>
          </>
        ) : (
          <>
            <p className="modal-hint">
              Each reviewer gets their own link. They can read the manuscript and leave comments and suggestions; they can’t change your text, and they can’t see each other’s notes.
              <strong> Copy link</strong> gives just the link; <strong>Copy invitation</strong> adds a short note with where to download MDEdit.
            </p>
            <ul className="share-list">
              {status?.reviewers.length === 0 && <li className="muted">No reviewers yet.</li>}
              {status?.reviewers.map((r) => {
                const c = counts.get(r.id);
                return (
                  <li key={r.id}>
                    <span className="grow-text">
                      {r.name}
                      <span className="muted small share-sub">
                        {' '}
                        {c ? `${c.open} open of ${c.total} note${c.total === 1 ? '' : 's'}` : 'no notes yet'}
                        {when(r.createdAt) ? ` · invited ${when(r.createdAt)}` : ''}
                      </span>
                    </span>
                    <button type="button" onClick={() => void copyNote(r.link, `Link for ${r.name}`)}>Copy link</button>
                    <button type="button" onClick={() => void copyNote(inviteMessage(projectName, r.link, r.name), `Invitation for ${r.name}`)}>Copy invitation</button>
                    <button type="button" disabled={busy} onClick={() => void run(() => api.revokeReviewer(project, r.id))}>Remove</button>
                  </li>
                );
              })}
            </ul>
            <form
              className="share-add"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                void run(async () => {
                  const r = await api.inviteReviewer(project, name.trim());
                  setName('');
                  setNote((await copy(inviteMessage(projectName, r.link, r.name))) ? `Invitation for ${r.name} copied. Send it to them (use Copy link above for the link alone).` : r.link);
                });
              }}
            >
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Reviewer’s name" aria-label="Reviewer’s name" maxLength={40} />
              <button type="submit" className="primary" disabled={busy || !name.trim()}>{busy ? 'Working…' : 'Create link'}</button>
            </form>
            {note && <div className="share-note" role="status">{note}</div>}
            {error && <div className="modal-error" role="alert">{error}</div>}
            <div className="modal-actions">
              {(status?.reviewers.length ?? 0) > 0 &&
                (confirmStop ? (
                  <button type="button" className="danger" disabled={busy} onClick={() => void run(async () => { await api.stopSharing(project); setConfirmStop(false); })}>
                    Yes, remove all {status!.reviewers.length} links
                  </button>
                ) : (
                  <button type="button" onClick={() => setConfirmStop(true)}>Stop sharing…</button>
                ))}
              <button type="button" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
