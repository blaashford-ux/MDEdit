import { useState } from 'react';
import type { Anchor } from '../shared/review/comments';
import type { Identity, ReviewState, ShownItem } from './useReview';

interface Props {
  state: ReviewState;
  me: Identity;
  /** The owner can resolve, accept and delete anyone's notes; a reviewer only their own. */
  role: 'owner' | 'reviewer';
  onRename(name: string): void;
  onClose(): void;
  /** Owner only: opens the sharing dialog. */
  onShare?(): void;
  /** A problem or change worth telling the user about (for example, access withdrawn). */
  notice?: string | null;
}

const excerpt = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Comments and suggestions on the open chapter's file. */
export function ReviewPanel({ state, me, role, onRename, onClose, onShare, notice }: Props) {
  const [draft, setDraft] = useState<{ anchor: Anchor; oneBlock: boolean } | null>(null);
  const [kind, setKind] = useState<'comment' | 'suggestion'>('comment');
  const [body, setBody] = useState('');
  const [replacement, setReplacement] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const begin = () => {
    const sel = state.selection();
    if (!sel) {
      setMessage('Select some text in the chapter first.');
      return;
    }
    setMessage(null);
    setDraft(sel);
    setReplacement(sel.anchor.quote);
    setKind(sel.oneBlock ? kind : 'comment');
  };

  const submit = () => {
    if (!draft) return;
    if (kind === 'comment' && !body.trim()) return;
    if (kind === 'suggestion' && replacement === draft.anchor.quote && !body.trim()) return;
    state.add(draft, kind, body.trim(), kind === 'suggestion' ? replacement : undefined);
    setDraft(null);
    setBody('');
  };

  const visible = state.items.filter((i) => showDone || i.status === 'open');
  const doneCount = state.items.length - state.items.filter((i) => i.status === 'open').length;
  const mine = (i: ShownItem) => role === 'owner' || i.reviewerId === me.id;

  return (
    <aside className="review-panel" aria-label="Comments and suggestions">
      <div className="review-head">
        <h3>Notes</h3>
        {onShare && <button type="button" className="review-share" onClick={onShare}>Share…</button>}
        <button type="button" aria-label="Close notes" onClick={onClose}>×</button>
      </div>

      {notice && <div className="banner warn" role="alert">{notice}</div>}

      {draft ? (
        <div className="review-compose">
          <blockquote>{excerpt(draft.anchor.quote, 160)}</blockquote>
          <div className="review-kinds" role="radiogroup" aria-label="Kind of note">
            <label><input type="radio" checked={kind === 'comment'} onChange={() => setKind('comment')} /> Comment</label>
            <label title={draft.oneBlock ? '' : 'A suggestion has to stay inside one paragraph'}>
              <input type="radio" disabled={!draft.oneBlock} checked={kind === 'suggestion'} onChange={() => setKind('suggestion')} /> Suggest a change
            </label>
          </div>
          {kind === 'suggestion' && (
            <label>
              Change it to
              <textarea value={replacement} onChange={(e) => setReplacement(e.target.value)} rows={3} />
            </label>
          )}
          <label>
            {kind === 'suggestion' ? 'Why (optional)' : 'Your comment'}
            <textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
          </label>
          <div className="modal-actions">
            <button type="button" onClick={() => setDraft(null)}>Cancel</button>
            <button type="button" className="primary" onClick={submit}>Add</button>
          </div>
        </div>
      ) : (
        <div className="review-begin">
          <button type="button" className="primary" onClick={begin}>Add note on selection</button>
          {message && <p className="review-msg" role="status">{message}</p>}
        </div>
      )}

      <ul className="review-list">
        {visible.length === 0 && <li className="review-empty">{state.items.length ? 'No open notes.' : 'No notes on this file yet.'}</li>}
        {visible.map((i) => (
          <li key={i.id} className={`review-item s-${i.status}${state.detached.has(i.id) ? ' detached' : ''}`}>
            <button type="button" className="review-quote" onClick={() => state.focus(i.id)} title="Show in the text">
              {excerpt(i.anchor.quote)}
            </button>
            <div className="review-meta">
              <strong>{i.author}</strong> · {i.kind === 'suggestion' ? 'suggestion' : 'comment'}
              {i.status !== 'open' && <span className="review-status"> · {i.status}</span>}
              {state.detached.has(i.id) && <span className="review-lost"> · not in this chapter</span>}
            </div>
            {i.kind === 'suggestion' && (
              <div className="review-diff">
                <del>{excerpt(i.anchor.quote, 120)}</del> <ins>{excerpt(i.replacement ?? '', 120)}</ins>
              </div>
            )}
            {i.body && <p className="review-body">{i.body}</p>}
            {i.replies.map((r) => (
              <p key={r.id} className="review-reply"><strong>{r.author}:</strong> {r.body}</p>
            ))}
            <div className="review-actions">
              {i.kind === 'suggestion' && i.status === 'open' && role === 'owner' && (
                <button type="button" onClick={() => void state.accept(i.id).then(setMessage)}>Accept</button>
              )}
              {i.status === 'open' && mine(i) && (
                <button type="button" onClick={() => void state.setStatus(i.id, i.kind === 'suggestion' ? 'rejected' : 'resolved')}>
                  {i.kind === 'suggestion' ? 'Reject' : 'Resolve'}
                </button>
              )}
              {i.status !== 'open' && mine(i) && <button type="button" onClick={() => void state.setStatus(i.id, 'open')}>Reopen</button>}
              <button type="button" onClick={() => setReplyFor(replyFor === i.id ? null : i.id)}>Reply</button>
              {mine(i) && <button type="button" onClick={() => void state.remove(i.id)}>Delete</button>}
            </div>
            {replyFor === i.id && (
              <div className="review-replybox">
                <textarea autoFocus rows={2} value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                <button
                  type="button"
                  disabled={!replyText.trim()}
                  onClick={() => {
                    void state.reply(i.id, replyText.trim());
                    setReplyText('');
                    setReplyFor(null);
                  }}
                >
                  Send
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="review-foot">
        {doneCount > 0 && (
          <label>
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show {doneCount} finished
          </label>
        )}
        <label className="review-name">
          Writing as
          <input value={me.name} onChange={(e) => onRename(e.target.value)} maxLength={40} />
        </label>
      </div>
    </aside>
  );
}
