import { BrowserWindow, dialog, type MessageBoxOptions } from 'electron';
import type { UnsavedChoice } from '../src/shared/api';

async function show(win: BrowserWindow | null, opts: MessageBoxOptions): Promise<number> {
  const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
  return response;
}

/** Windows-style Save / Don't Save / Cancel. Escape or closing the dialog means Cancel. */
export async function confirmUnsaved(win: BrowserWindow | null, fileName: string): Promise<UnsavedChoice> {
  const response = await show(win, {
    type: 'warning',
    title: 'MDEdit',
    message: `Do you want to save the changes to ${fileName}?`,
    detail: "Your changes will be lost if you don't save them.",
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  });
  return (['save', 'discard', 'cancel'] as const)[response] ?? 'cancel';
}

export async function confirmOverwrite(win: BrowserWindow | null, fileName: string): Promise<boolean> {
  const response = await show(win, {
    type: 'warning',
    title: 'MDEdit',
    message: `${fileName} was changed on disk since you opened it.`,
    detail: 'Saving now will overwrite those changes.',
    buttons: ['Overwrite', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  });
  return response === 0;
}
