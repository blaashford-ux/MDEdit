import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import type { MenuAction } from '../src/shared/api';

/**
 * Replaces Electron's default menu. The default has View > Reload (Ctrl+R / Ctrl+Shift+R),
 * which would reload the page and silently discard unsaved edits.
 *
 * Shortcuts are shown as label hints ("\t") rather than registered accelerators: the renderer
 * already handles Ctrl+S / F5 / Ctrl+O, and a second registration would fire twice.
 */
export function installMenu(): void {
  const send = (action: MenuAction) => () => {
    BrowserWindow.getFocusedWindow()?.webContents.send('menu:action', action);
  };

  const template: MenuItemConstructorOptions[] = [
    {
      label: '&File',
      submenu: [
        { label: 'Change Folder…\tCtrl+O', click: send('change-folder') },
        { label: 'Refresh\tF5', click: send('refresh') },
        { type: 'separator' },
        { label: 'Save\tCtrl+S', click: send('save') },
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
      label: '&View',
      submenu: [
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
