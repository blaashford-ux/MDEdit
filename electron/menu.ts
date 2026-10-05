import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import type { MenuAction, ThemeSource } from '../src/shared/api';

interface ThemeHooks {
  get(): ThemeSource;
  set(theme: ThemeSource): void;
}

/**
 * Replaces Electron's default menu. The default has View > Reload (Ctrl+R / Ctrl+Shift+R),
 * which would reload the page and silently discard unsaved edits.
 *
 * Shortcuts are shown as label hints ("\t") rather than registered accelerators: the renderer
 * already handles them, and a second registration would fire twice.
 */
export function installMenu(theme: ThemeHooks): void {
  const send = (action: MenuAction) => () => {
    BrowserWindow.getFocusedWindow()?.webContents.send('menu:action', action);
  };
  const themeItem = (label: string, value: ThemeSource): MenuItemConstructorOptions => ({
    label,
    type: 'radio',
    checked: theme.get() === value,
    click: () => theme.set(value)
  });

  const template: MenuItemConstructorOptions[] = [
    {
      label: '&File',
      submenu: [
        { label: 'New File…\tCtrl+N', click: send('new-file') },
        { label: 'New Folder…\tCtrl+Shift+N', click: send('new-folder') },
        { label: 'Change Folder…\tCtrl+O', click: send('change-folder') },
        { label: 'Refresh\tF5', click: send('refresh') },
        { type: 'separator' },
        { label: 'Save\tCtrl+S', click: send('save') },
        { label: 'Close Tab\tCtrl+W', click: send('close-tab') },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: '&Go',
      submenu: [
        { label: 'Next Chapter\tCtrl+PgDn', click: send('next-chapter') },
        { label: 'Previous Chapter\tCtrl+PgUp', click: send('prev-chapter') },
        { type: 'separator' },
        { label: 'Next Tab\tCtrl+Tab', click: send('next-tab') },
        { label: 'Previous Tab\tCtrl+Shift+Tab', click: send('prev-tab') }
      ]
    },
    {
      label: '&View',
      submenu: [
        {
          label: 'Theme',
          submenu: [themeItem('Match Windows', 'system'), themeItem('Light', 'light'), themeItem('Dark', 'dark')]
        },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : ([{ type: 'separator' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[]))
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
