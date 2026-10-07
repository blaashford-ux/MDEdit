import { useState } from 'react';
import { parseInviteLink } from '../shared/review/link';
import type { SharedProject } from '../shared/review/share';
import { PickerFrame } from './PickerFrame';
import { useEscape } from './useEscape';
import { loadIdentity, saveIdentity } from './useReview';

interface Props {
  onJoined(p: SharedProject): void;
  onClose(): void;
}

/** Open an invitation: paste the link, let Google's picker grant access to the two files, then download the project. */
export function JoinDialog({ onJoined, onClose }: Props) {
  const [link, setLink] = useState('');
  const [name, setName] = useState(() => {
    const me = loadIdentity();
    return me.id === 'owner' ? '' : me.name;
  });
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose);
  const api = window.mdedit;
  const invite = parseInviteLink(link);

  const start = async () => {
    if (!invite) return;
    setBusy(true);
    setError(null);
    try {
      setToken(await api.pickerToken());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setToken(null);
    setBusy(true);
    try {
      const shared = await api.joinReview(link, name);
      // Remember who this is on this device, so notes are signed with the reviewer's name.
      saveIdentity({ id: shared.reviewerId, name: name.trim() || 'Reviewer' });
      onJoined(shared);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal join-dialog" role="dialog" aria-modal="true" aria-label="Open an invitation">
        <h3>Open an invitation</h3>
        {token && invite ? (
          <PickerFrame
            token={token}
            ids={[invite.packageId, invite.commentsId]}
            onPicked={(ids) => (ids.includes(invite.packageId) && ids.includes(invite.commentsId) ? void finish() : (setToken(null), setError('Select both files so MDEdit can open the project and save your notes.')))}
            onCancel={() => setToken(null)}
            onError={() => (setToken(null), setError('Couldn’t load Google’s file picker. Check your connection and try again.'))}
          />
        ) : (
          <>
            <p className="modal-hint">Paste the link you were sent (or the whole message). Google will ask you to select two files; that is how MDEdit is allowed to open this one project (and nothing else in your Drive).</p>
            <label>
              Invitation link
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" autoFocus aria-invalid={link !== '' && !invite} />
            </label>
            <label>
              Your name (shown on your notes)
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            </label>
            {link !== '' && !invite && <div className="modal-error" role="alert">That doesn’t look like a MDEdit invitation.</div>}
            {error && <div className="modal-error" role="alert">{error}</div>}
            <div className="modal-actions">
              <button type="button" onClick={onClose}>Cancel</button>
              <button type="button" className="primary" disabled={!invite || busy} onClick={() => void start()}>
                {busy ? 'Opening…' : 'Continue'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
