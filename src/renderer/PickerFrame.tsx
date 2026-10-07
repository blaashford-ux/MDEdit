import { useEffect } from 'react';
import { JOIN_PAGE } from '../shared/review/link';

interface Props {
  /** Access token for the Drive scope; goes to the picker page in the address fragment (never sent to a server). */
  token: string;
  ids: string[];
  onPicked(ids: string[]): void;
  onCancel(): void;
  onError(): void;
}

/** Google's file picker, shown inside the app. Picking the files is what gives MDEdit permission to open them. */
export function PickerFrame({ token, ids, onPicked, onCancel, onError }: Props) {
  useEffect(() => {
    const origin = new URL(JOIN_PAGE).origin;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.data?.source !== 'mdedit-picker') return;
      if (Array.isArray(e.data.picked)) onPicked(e.data.picked.map(String));
      else if (e.data.cancelled) onCancel();
      else if (e.data.error) onError();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onPicked, onCancel, onError]);

  const q = new URLSearchParams({ mode: 'pick', t: token, p: ids[0] ?? '', c: ids[1] ?? '' });
  return <iframe className="picker-frame" title="Google file picker" src={`${JOIN_PAGE}#${q}`} allow="clipboard-write" />;
}
