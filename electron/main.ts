import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { readWithStamp, statStamp, writeFileAtomic } from './files';
import { installMenu } from './menu';
import { confirmOverwrite, confirmUnsaved } from './prompts';
import { scanFolder } from './scan';
import { existingLastFolder, saveSettings } from './settings';

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

// Paths the renderer may read/write: only inside the folder the user picked.
let openRoot: string | null = null;

function inRoot(p: string): string {
  if (!openRoot) throw new Error('No folder is open');
  const full = path.resolve(p);
  const rel = path.relative(openRoot, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path is outside the opened folder');
  return full;
}

const isMarkdown = (p: string) => /\.(md|markdown)$/i.test(p);

/** File with unsaved edits in the renderer, or null. Reported by the renderer. */
let dirtyFile: string | null = null;

function registerIpc(): void {
  const winOf = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender);

  ipcMain.handle('dialog:pickFolder', async (e) => {
    const win = winOf(e);
    const opts = { properties: ['openDirectory' as const] };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return res.canceled || res.filePaths.length === 0 ? null : path.resolve(res.filePaths[0]);
  });
  ipcMain.handle('settings:getLastFolder', () => existingLastFolder(settingsFile()));
  ipcMain.handle('fs:scanFolder', async (_e, root: string) => {
    const tree = await scanFolder(path.resolve(root));
    openRoot = path.resolve(root);
    await saveSettings(settingsFile(), { lastFolder: openRoot }).catch(() => undefined);
    return tree;
  });
  ipcMain.handle('fs:readFile', (_e, p: string) => readWithStamp(inRoot(p)));
  ipcMain.handle('fs:statFile', (_e, p: string) => statStamp(inRoot(p)));
  ipcMain.handle('fs:writeFile', (_e, p: string, content: string) => {
    const full = inRoot(p);
    if (!isMarkdown(full)) throw new Error('Refusing to write a non-Markdown file');
    return writeFileAtomic(full, content);
  });
  ipcMain.handle('dialog:confirmUnsaved', (e, name: string) => confirmUnsaved(winOf(e), name));
  ipcMain.handle('dialog:confirmOverwrite', (e, name: string) => confirmOverwrite(winOf(e), name));
  ipcMain.on('app:setDirty', (_e, name: string | null) => {
    dirtyFile = name;
  });
}

/** Asks the renderer to save its open chapter; resolves to whether that worked. */
function requestSave(win: BrowserWindow): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ipcMain.removeListener('app:saveResult', onResult);
      resolve(false);
    }, 15_000);
    const onResult = (_e: Electron.IpcMainEvent, ok: boolean) => {
      clearTimeout(timer);
      resolve(ok === true);
    };
    ipcMain.once('app:saveResult', onResult);
    win.webContents.send('app:saveBeforeClose');
  });
}

/** Closing (X button, Alt+F4, quit) with unsaved edits asks Save / Don't Save / Cancel first. */
function guardClose(win: BrowserWindow): void {
  let prompting = false;
  let confirmed = false;
  win.on('close', (e) => {
    if (confirmed || !dirtyFile) return;
    e.preventDefault();
    if (prompting) return;
    prompting = true;
    void (async () => {
      try {
        const choice = await confirmUnsaved(win, dirtyFile ?? 'this file');
        if (choice === 'cancel') return;
        if (choice === 'save' && !(await requestSave(win))) return;
        confirmed = true;
        win.close();
      } finally {
        prompting = false;
      }
    })();
  });
}

function createWindow(): BrowserWindow {
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
  guardClose(win);

  if (process.env.VITE_DEV_SERVER_URL || !app.isPackaged) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173');
  } else {
    void win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
  return win;
}

app.whenReady().then(() => {
  registerIpc();
  installMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
