import { app, BrowserWindow, dialog, ipcMain, nativeTheme, screen, shell } from 'electron';
import path from 'node:path';
import type { DraftRecord, Prefs, Session, ThemeSource } from '../src/shared/api';
import { DraftStore } from './drafts';
import { readWithStamp, statStamp, writeFileAtomic } from './files';
import { loadDetails, renameSidecar, saveDetails, setMarked, existingSidecar } from './export/sidecar';
import { createFile, createFolder, renameNode } from './fsops';
import { sidecarPathFor } from '../src/shared/export/sidecar';
import { promises as fsp } from 'node:fs';
import { installMenu } from './menu';
import { confirmDelete, confirmOverwrite, confirmRecover, confirmUnsaved } from './prompts';
import { scanFolder } from './scan';
import { existingFolder, SettingsStore, type WindowState } from './settings';

let settings: SettingsStore;
let drafts: DraftStore;

// Paths the renderer may read/write: only inside the folder the user picked.
let openRoot: string | null = null;

function inRoot(p: string, opts: { allowRoot?: boolean } = {}): string {
  if (!openRoot) throw new Error('No folder is open');
  const full = path.resolve(p);
  const rel = path.relative(openRoot, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path is outside the opened folder');
  if (rel === '' && !opts.allowRoot) throw new Error('Refusing to operate on the root folder itself');
  return full;
}

const isMarkdown = (p: string) => /\.(md|markdown)$/i.test(p);

/** Files with unsaved edits in the renderer. Reported by the renderer. */
let dirtyFiles: string[] = [];

function setTheme(theme: ThemeSource): void {
  nativeTheme.themeSource = theme;
  settings.update((s) => {
    s.theme = theme;
  });
}

function registerIpc(): void {
  const winOf = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender);

  ipcMain.handle('dialog:pickFolder', async (e) => {
    const win = winOf(e);
    const opts = { properties: ['openDirectory' as const] };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return res.canceled || res.filePaths.length === 0 ? null : path.resolve(res.filePaths[0]);
  });
  ipcMain.handle('settings:getLastFolder', () => existingFolder(settings.get().lastFolder));
  ipcMain.handle('fs:scanFolder', async (_e, root: string) => {
    const tree = await scanFolder(path.resolve(root));
    openRoot = path.resolve(root);
    settings.update((s) => {
      s.lastFolder = openRoot!;
    });
    return tree;
  });
  ipcMain.handle('fs:readFile', (_e, p: string) => readWithStamp(inRoot(p)));
  ipcMain.handle('fs:statFile', (_e, p: string) => statStamp(inRoot(p)));
  ipcMain.handle('fs:writeFile', (_e, p: string, content: string) => {
    const full = inRoot(p);
    if (!isMarkdown(full)) throw new Error('Refusing to write a non-Markdown file');
    return writeFileAtomic(full, content);
  });
  ipcMain.handle('fs:createFile', (_e, dir: string, name: string, content?: string) =>
    createFile(inRoot(dir, { allowRoot: true }), name, content)
  );
  ipcMain.handle('fs:createFolder', (_e, dir: string, name: string) =>
    createFolder(inRoot(dir, { allowRoot: true }), name)
  );
  ipcMain.handle('fs:renameNode', async (_e, p: string, newName: string) => {
    const from = inRoot(p);
    const to = await renameNode(from, newName);
    if (isMarkdown(from)) await renameSidecar(from, to).catch(() => undefined); // export settings follow the file
    return to;
  });
  ipcMain.handle('fs:trashNode', async (_e, p: string) => {
    const full = inRoot(p);
    await shell.trashItem(full);
    if (isMarkdown(full)) {
      const sidecar = await existingSidecar(full);
      if (sidecar) await shell.trashItem(sidecar).catch(() => undefined);
    }
  });

  // --- export: book details ---
  const mdPath = (p: string) => {
    const full = inRoot(p);
    if (!isMarkdown(full)) throw new Error('Only Markdown files can be exported');
    return full;
  };
  ipcMain.handle('export:getDetails', (_e, p: string) => loadDetails(mdPath(p)));
  ipcMain.handle('export:saveDetails', (_e, p: string, details: unknown) => saveDetails(mdPath(p), details as never));
  ipcMain.handle('export:setMarked', (_e, p: string, marked: boolean) => setMarked(mdPath(p), marked === true));
  ipcMain.handle('export:relink', async (_e, sidecar: string, md: string) => {
    const from = inRoot(sidecar);
    const target = sidecarPathFor(mdPath(md));
    if (!from.toLowerCase().endsWith('.export.json')) throw new Error('Not an export-settings file');
    try {
      await fsp.lstat(target);
      throw new Error('That file already has export settings.');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    await fsp.rename(from, target);
  });
  ipcMain.handle('export:pickCover', async (e) => {
    const win = winOf(e);
    const opts = { properties: ['openFile' as const], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }] };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
  });
  ipcMain.on('shell:reveal', (_e, p: string) => {
    try {
      shell.showItemInFolder(inRoot(p, { allowRoot: true }));
    } catch {
      // ignore bad paths
    }
  });

  ipcMain.handle('prefs:get', () => settings.get().prefs ?? {});
  ipcMain.on('prefs:set', (_e, patch: Partial<Prefs>) => {
    if (typeof patch?.sidebarWidth === 'number' && Number.isFinite(patch.sidebarWidth)) {
      settings.update((s) => {
        s.prefs = { ...s.prefs, sidebarWidth: patch.sidebarWidth };
      });
    }
  });
  ipcMain.handle('session:get', (_e, folder: string) => settings.get().sessions?.[folder] ?? null);
  ipcMain.on('session:save', (_e, folder: string, session: Session) => {
    if (typeof folder === 'string' && session && Array.isArray(session.tabs)) settings.setSession(folder, session);
  });

  ipcMain.handle('drafts:save', (_e, d: DraftRecord) => drafts.save(d));
  ipcMain.handle('drafts:clear', (_e, file: string) => drafts.clear(file));
  ipcMain.handle('drafts:list', () => drafts.list());

  ipcMain.handle('dialog:confirmUnsaved', (e, name: string) => confirmUnsaved(winOf(e), name));
  ipcMain.handle('dialog:confirmOverwrite', (e, name: string) => confirmOverwrite(winOf(e), name));
  ipcMain.handle('dialog:confirmDelete', (e, name: string, kind: 'file' | 'folder' | 'chapter', unsaved: boolean) =>
    confirmDelete(winOf(e), name, kind, unsaved)
  );
  ipcMain.handle('dialog:confirmRecover', (e, name: string) => confirmRecover(winOf(e), name));
  ipcMain.on('app:setDirtyFiles', (_e, names: string[]) => {
    dirtyFiles = Array.isArray(names) ? names.filter((n) => typeof n === 'string') : [];
  });
}

/** Closing (X button, Alt+F4, quit) with unsaved tabs asks the renderer to resolve them first. */
function guardClose(win: BrowserWindow): void {
  let waiting = false;
  let confirmed = false;
  win.on('close', (e) => {
    saveWindowState(win);
    if (confirmed || dirtyFiles.length === 0 || win.webContents.isCrashed()) return;
    e.preventDefault();
    if (waiting) return;
    waiting = true;
    ipcMain.once('app:closeDecision', (_e, ok: boolean) => {
      waiting = false;
      if (ok === true) {
        confirmed = true;
        win.close();
      }
    });
    win.webContents.send('app:closeRequested');
  });
}

function saveWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  const b = win.getNormalBounds();
  const state: WindowState = { ...b, ...(win.isMaximized() ? { maximized: true } : {}) };
  settings.update((s) => {
    s.window = state;
  });
}

/** Saved bounds, but only if they still land on a connected display. */
function restoredBounds(): Partial<Electron.Rectangle> & { width: number; height: number } {
  const w = settings.get().window;
  const fallback = { width: 1200, height: 800 };
  if (!w) return fallback;
  const size = { width: Math.max(600, w.width), height: Math.max(400, w.height) };
  if (w.x === undefined || w.y === undefined) return size;
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return w.x! < a.x + a.width - 50 && w.x! + size.width > a.x + 50 && w.y! >= a.y - 10 && w.y! < a.y + a.height - 50;
  });
  return visible ? { ...size, x: w.x, y: w.y } : size;
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    ...restoredBounds(),
    title: 'MDEdit',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (settings.get().window?.maximized) win.maximize();
  guardClose(win);

  let timer: NodeJS.Timeout | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => saveWindowState(win), 800);
  };
  win.on('resize', later);
  win.on('move', later);

  if (process.env.VITE_DEV_SERVER_URL || !app.isPackaged) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173');
  } else {
    void win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
  return win;
}

app.whenReady().then(async () => {
  settings = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
  await settings.load();
  drafts = new DraftStore(path.join(app.getPath('userData'), 'drafts'));
  nativeTheme.themeSource = settings.get().theme ?? 'system';

  registerIpc();
  installMenu({ get: () => settings.get().theme ?? 'system', set: setTheme });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  void settings?.flush();
});

app.on('window-all-closed', () => {
  void settings.flush().finally(() => {
    if (process.platform !== 'darwin') app.quit();
  });
});
