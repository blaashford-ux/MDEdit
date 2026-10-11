import { useEffect, useState } from 'react';
import type { FormatApi } from './sceneNav';

/** Distance between the bottom of the layout and the bottom of what is actually visible (the on-screen keyboard). */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

/** True while the caret is in the formatted editor (the keyboard is up); the bar stays out of the way otherwise. */
function useEditorFocus(): boolean {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const inEditor = (t: EventTarget | null) => t instanceof Element && t.closest('.ProseMirror') !== null;
    const on = (e: FocusEvent) => setFocused(inEditor(e.target));
    const off = (e: FocusEvent) => {
      if (inEditor(e.target) && !inEditor(e.relatedTarget)) setFocused(false);
    };
    setFocused(inEditor(document.activeElement));
    document.addEventListener('focusin', on);
    document.addEventListener('focusout', off);
    return () => {
      document.removeEventListener('focusin', on);
      document.removeEventListener('focusout', off);
    };
  }, []);
  return focused;
}

interface Props {
  format: FormatApi;
}

/**
 * Formatting for the phone, docked above the keyboard instead of floating over the selected text (where it covers the
 * selection handles). Buttons take no focus, so pressing one keeps the keyboard up and the selection where it was.
 */
export function FormatBar({ format }: Props) {
  const inset = useKeyboardInset();
  const focused = useEditorFocus();
  if (!focused) return null;
  const keep = (e: { preventDefault(): void }) => e.preventDefault();
  const btn = (label: string, title: string, run: () => void, cls = '') => (
    <button type="button" className={`fb-btn ${cls}`} aria-label={title} title={title} onPointerDown={keep} onMouseDown={keep} onClick={run}>
      {label}
    </button>
  );
  return (
    <div className="format-bar" role="toolbar" aria-label="Formatting" style={{ bottom: inset }}>
      {btn('B', 'Bold', format.bold, 'b')}
      {btn('I', 'Italic', format.italic, 'i')}
      {btn('H1', 'Chapter heading', () => format.heading(1))}
      {btn('H2', 'Heading', () => format.heading(2))}
      {btn('❝', 'Quote', format.quote)}
      {btn('•', 'Bulleted list', format.bullets)}
      {btn('1.', 'Numbered list', format.numbered)}
      {btn('⁂', 'Scene break', format.sceneBreak)}
      {btn('↶', 'Undo', format.undo)}
      {btn('↷', 'Redo', format.redo)}
    </div>
  );
}
