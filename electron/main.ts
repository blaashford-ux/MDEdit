import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { scanFolder } from './scan';

// Paths the renderer may read: only inside the folder the user picked.
let openRoot: string | null = null;

function isInsideRoot(p: string): boolean {
  if (!openRoot) return false;
  const rel = path.relative(openRoot, path.resolve(p));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function registerIpc(): void {
  ipcMain.handle('dialog:pickFolder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const opts = { properties: ['openDirectory' as const] };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (res.canceled || res.filePaths.length === 0) return null;
    openRoot = path.resolve(res.filePaths[0]);
    return openRoot;
  });
  ipcMain.handle('fs:scanFolder', (_e, root: string) => {
    openRoot = path.resolve(root);
    return scanFolder(openRoot);
  });
  ipcMain.handle('fs:readFile', async (_e, p: string) => {
    if (!isInsideRoot(p)) throw new Error('Path is outside the opened folder');
    return fs.readFile(p, 'utf8');
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'MDEdit',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.env.VITE_DEV_SERVER_URL || !app.isPackaged) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173');
  } else {
    void win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
