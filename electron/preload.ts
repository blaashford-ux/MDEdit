import { contextBridge, ipcRenderer } from 'electron';
import type { ExportProgress, MdeditApi, MenuAction } from '../src/shared/api';

const api: MdeditApi = {
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  getLastFolder: () => ipcRenderer.invoke('settings:getLastFolder'),
  scanFolder: (root) => ipcRenderer.invoke('fs:scanFolder', root),
  readFile: (p) => ipcRenderer.invoke('fs:readFile', p),
  statFile: (p) => ipcRenderer.invoke('fs:statFile', p),
  writeFile: (p, content) => ipcRenderer.invoke('fs:writeFile', p, content),
  createFile: (dir, name, content) => ipcRenderer.invoke('fs:createFile', dir, name, content),
  createFolder: (dir, name) => ipcRenderer.invoke('fs:createFolder', dir, name),
  renameNode: (p, name) => ipcRenderer.invoke('fs:renameNode', p, name),
  trashNode: (p) => ipcRenderer.invoke('fs:trashNode', p),
  reveal: (p) => ipcRenderer.send('shell:reveal', p),
  getBookDetails: (file) => ipcRenderer.invoke('export:getDetails', file),
  saveBookDetails: (file, details) => ipcRenderer.invoke('export:saveDetails', file, details),
  setMarked: (file, marked) => ipcRenderer.invoke('export:setMarked', file, marked),
  relinkSidecar: (sidecar, md) => ipcRenderer.invoke('export:relink', sidecar, md),
  listInstalledFonts: () => ipcRenderer.invoke('fonts:installed'),
  bundledFontPreview: (family) => ipcRenderer.invoke('fonts:preview', family),
  pickCoverImage: () => ipcRenderer.invoke('export:pickCover'),
  planExport: (file, unsaved) => ipcRenderer.invoke('export:plan', file, unsaved),
  runExport: (file) => ipcRenderer.invoke('export:run', file),
  cancelExport: () => ipcRenderer.send('export:cancel'),
  onExportProgress: (cb) => {
    const handler = (_e: unknown, p: ExportProgress) => cb(p);
    ipcRenderer.on('export:progress', handler);
    return () => ipcRenderer.removeListener('export:progress', handler);
  },
  revealOutput: (p) => ipcRenderer.send('export:reveal', p),
  openOutput: (p) => ipcRenderer.invoke('export:open', p),
  takeLaunchFiles: () => ipcRenderer.invoke('app:takeLaunchFiles'),
  onLaunchFiles: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('app:launchFiles', handler);
    return () => ipcRenderer.removeListener('app:launchFiles', handler);
  },
  getAppDefaults: () => ipcRenderer.invoke('app:getDefaults'),
  setAppDefaults: (d) => ipcRenderer.invoke('app:setDefaults', d),
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (patch) => ipcRenderer.send('prefs:set', patch),
  getSession: (folder) => ipcRenderer.invoke('session:get', folder),
  saveSession: (folder, session) => ipcRenderer.send('session:save', folder, session),
  saveDraft: (d) => ipcRenderer.invoke('drafts:save', d),
  clearDraft: (file) => ipcRenderer.invoke('drafts:clear', file),
  listDrafts: () => ipcRenderer.invoke('drafts:list'),
  confirmUnsaved: (name) => ipcRenderer.invoke('dialog:confirmUnsaved', name),
  confirmOverwrite: (name) => ipcRenderer.invoke('dialog:confirmOverwrite', name),
  confirmDelete: (name, kind, unsaved) => ipcRenderer.invoke('dialog:confirmDelete', name, kind, unsaved),
  confirmRecover: (name) => ipcRenderer.invoke('dialog:confirmRecover', name),
  setDirtyFiles: (names) => ipcRenderer.send('app:setDirtyFiles', names),
  onCloseRequested: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('app:closeRequested', handler);
    return () => ipcRenderer.removeListener('app:closeRequested', handler);
  },
  reportCloseDecision: (ok) => ipcRenderer.send('app:closeDecision', ok),
  onMenuAction: (cb) => {
    const handler = (_e: unknown, action: MenuAction) => cb(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  }
};

contextBridge.exposeInMainWorld('mdedit', api);
