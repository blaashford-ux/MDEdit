import { useEffect, useState } from 'react';
import type { SyncStatus } from '../shared/api';
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

/** Invite reviewers to a project: one link per person, which can be withdrawn. */
export function ShareDialog({ project, projectName, sync, onConnect, onClose }: Props) {
  const api = window.mdedit;
  const [status, setStatus] = useState<ShareStatus | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEscape(onClose);

  const load = () => void api.getShareStatus(project).then(setStatus).catch(() => undefined);
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
            </p>
            <ul className="share-list">
              {status?.reviewers.length === 0 && <li className="muted">No reviewers yet.</li>}
              {status?.reviewers.map((r) => (
                <li key={r.id}>
                  <span className="grow-text">{r.name}</span>
                  <button type="button" onClick={() => void copy(r.link).then((ok) => setNote(ok ? `Link for ${r.name} copied.` : 'Couldn’t copy; select the link below.'))}>Copy link</button>
                  <button type="button" disabled={busy} onClick={() => void run(() => api.revokeReviewer(project, r.id))}>Remove</button>
                </li>
              ))}
            </ul>
            <form
              className="share-add"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                void run(async () => {
                  const r = await api.inviteReviewer(project, name.trim());
                  setName('');
                  setNote((await copy(r.link)) ? `Link for ${r.name} copied. Send it to them.` : r.link);
                });
              }}
            >
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Reviewer’s name" aria-label="Reviewer’s name" maxLength={40} />
              <button type="submit" className="primary" disabled={busy || !name.trim()}>{busy ? 'Working…' : 'Create link'}</button>
            </form>
            {note && <div className="share-note" role="status">{note}</div>}
            {error && <div className="modal-error" role="alert">{error}</div>}
            <div className="modal-actions">
              <button type="button" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
