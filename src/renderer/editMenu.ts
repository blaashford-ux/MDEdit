import type { MenuItem } from './ContextMenu';

/** The two kinds of text surface the app edits in: the Markdown source box and the formatted (ProseMirror) editor. */
export const EDITABLE = 'textarea.source-editor, .ProseMirror';

export const isEditable = (el: HTMLElement) => !!el.closest(EDITABLE);

const isTextarea = (el: Element): el is HTMLTextAreaElement => el instanceof HTMLTextAreaElement;

function selectedText(host: HTMLElement): string {
  if (isTextarea(host)) return host.value.slice(host.selectionStart, host.selectionEnd);
  return window.getSelection()?.toString() ?? '';
}

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    t.style.cssText = 'position:fixed;opacity:0;left:-9999px';
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
}

/** Puts `text` into the editor the way typing would, so undo and the unsaved-changes tracking see it. */
function insert(host: HTMLElement, text: string) {
  host.focus();
  if (!isTextarea(host)) {
    // The formatted editor handles paste itself (it splits paragraphs and strips formatting).
    const data = new DataTransfer();
    data.setData('text/plain', text);
    const ev = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    host.dispatchEvent(ev);
    if (ev.defaultPrevented) return;
  }
  if (!document.execCommand('insertText', false, text) && isTextarea(host)) {
    host.setRangeText(text, host.selectionStart, host.selectionEnd, 'end');
    host.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function selectAll(host: HTMLElement) {
  host.focus();
  if (isTextarea(host)) {
    host.select();
    return;
  }
  const r = document.createRange();
  r.selectNodeContents(host);
  const s = window.getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}

/** Cut / Copy / Paste / Select all (what the phone's own menu offers) plus Find, for the editor under the finger. */
export function editMenuItems(target: HTMLElement, onFind: () => void): MenuItem[] {
  const host = target.closest<HTMLElement>(EDITABLE);
  if (!host) return [];
  const text = selectedText(host);
  const has = text.length > 0;
  return [
    {
      label: 'Cut',
      disabled: !has,
      onClick: () => {
        host.focus();
        if (!document.execCommand('cut')) {
          void writeClipboard(text);
          document.execCommand('delete');
        }
      }
    },
    { label: 'Copy', disabled: !has, onClick: () => void writeClipboard(text) },
    {
      label: 'Paste',
      onClick: () => {
        void navigator.clipboard
          .readText()
          .then((t) => t && insert(host, t))
          .catch(() => host.focus()); // clipboard read refused: nothing to paste
      }
    },
    { label: 'Select all', onClick: () => selectAll(host) },
    { label: 'Find…', onClick: onFind }
  ];
}
