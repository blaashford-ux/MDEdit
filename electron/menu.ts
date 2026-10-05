import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions } from 'electron';
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
        { label: 'Export…\tCtrl+E', click: send('export') },
        { label: 'Settings…\tCtrl+,', click: send('settings') },
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
        { label: 'Next Scene Break\tCtrl+Down', click: send('next-scene') },
        { label: 'Previous Scene Break\tCtrl+Up', click: send('prev-scene') },
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
    },
    {
      label: '&Help',
      submenu: [
        {
          label: 'About MDEdit',
          click: () => {
            const opts = {
              type: 'info' as const,
              title: 'About MDEdit',
              message: `MDEdit ${app.getVersion()}`,
              detail: [
                'A folder-based Markdown editor with KDP export.',
                '',
                `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
                '',
                'Bundled fonts: EB Garamond, Crimson Pro, Libre Baskerville (SIL Open Font License 1.1).',
                'Print layout: Paged.js (MIT).'
              ].join('\n'),
              buttons: ['OK']
            };
            const win = BrowserWindow.getFocusedWindow();
            void (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts));
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
