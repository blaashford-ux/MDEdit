import { useEffect, useState } from 'react';
import { aiConfigSnippets, aiReviewers, type AiReviewerSummary, type AiServerInfo } from '../shared/agent/config';
import { useEscape } from './useEscape';

interface Props {
  project: string;
  projectName: string;
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

/** Connect an AI app (Claude, GPT…) so it can review this project, and see or remove the notes it has left. */
export function AiDialog({ project, projectName, onClose }: Props) {
  const api = window.mdedit;
  const [server, setServer] = useState<AiServerInfo | null | undefined>(undefined);
  const [reviewers, setReviewers] = useState<AiReviewerSummary[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose);

  const load = () => void api.listReviews(project).then((l) => setReviewers(aiReviewers(l))).catch(() => undefined);
  useEffect(() => {
    void api.getAiServer().then(setServer).catch(() => setServer(null));
    load();
  }, [project]);

  const snippets = server ? aiConfigSnippets(server) : null;
  const rows: [string, string, string][] = snippets
    ? [
        ['Claude Code', 'Run this in a terminal', snippets.claudeCode],
        ['Claude Desktop', 'Add to claude_desktop_config.json', snippets.claudeDesktop],
        ['Codex (GPT)', 'Add to ~/.codex/config.toml', snippets.codex],
      ]
    : [];

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal share-dialog ai-dialog" role="dialog" aria-modal="true" aria-label="AI reviewers">
        <h3>AI reviewers</h3>
        <p className="modal-hint">
          Connect Claude, GPT or another AI app that supports MCP and it can read your chapters in <strong>{server?.root ?? 'your projects folder'}</strong> and leave comments and suggestions here.
          It can’t change your text: you accept or reject each note. If you move your Root Folder, copy the settings again.
        </p>

        {server === undefined && <p className="muted">Looking…</p>}
        {server === null && <p className="modal-error">This build of MDEdit doesn’t include the AI connection.</p>}
        {rows.map(([name, hint, text]) => (
          <div key={name} className="ai-snippet">
            <div className="ai-snippet-head">
              <strong>{name}</strong>
              <span className="muted small">{hint}</span>
              <button type="button" onClick={() => void copy(text).then((ok) => setNote(ok ? `${name} settings copied.` : 'Couldn’t copy to the clipboard.'))}>Copy</button>
            </div>
            <pre>{text}</pre>
          </div>
        ))}
        {note && <div className="share-note" role="status">{note}</div>}

        <h4>Notes from AI in “{projectName}”</h4>
        <ul className="share-list">
          {reviewers.length === 0 && <li className="muted">None yet.</li>}
          {reviewers.map((r) => (
            <li key={r.id}>
              <span className="grow-text">
                {r.name}
                <span className="muted small share-sub"> {r.open} open of {r.total} note{r.total === 1 ? '' : 's'}</span>
              </span>
              {confirm === r.id ? (
                <>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      setConfirm(null);
                      setError(null);
                      void api.deleteReview(project, r.id).then(load, (e) => setError(e instanceof Error ? e.message : String(e)));
                    }}
                  >
                    Yes, delete {r.total}
                  </button>
                  <button type="button" onClick={() => setConfirm(null)}>Cancel</button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirm(r.id)}>Delete all…</button>
              )}
            </li>
          ))}
        </ul>
        {error && <div className="modal-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
