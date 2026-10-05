import { contextBridge, ipcRenderer } from 'electron';
import type { MdeditApi, MenuAction } from '../src/shared/api';

const api: MdeditApi = {
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  getLastFolder: () => ipcRenderer.invoke('settings:getLastFolder'),
  scanFolder: (root) => ipcRenderer.invoke('fs:scanFolder', root),
  readFile: (p) => ipcRenderer.invoke('fs:readFile', p),
  statFile: (p) => ipcRenderer.invoke('fs:statFile', p),
  writeFile: (p, content) => ipcRenderer.invoke('fs:writeFile', p, content),
  confirmUnsaved: (name) => ipcRenderer.invoke('dialog:confirmUnsaved', name),
  confirmOverwrite: (name) => ipcRenderer.invoke('dialog:confirmOverwrite', name),
  setDirty: (name) => ipcRenderer.send('app:setDirty', name),
  onSaveBeforeClose: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('app:saveBeforeClose', handler);
    return () => ipcRenderer.removeListener('app:saveBeforeClose', handler);
  },
  reportSaveResult: (ok) => ipcRenderer.send('app:saveResult', ok),
  onMenuAction: (cb) => {
    const handler = (_e: unknown, action: MenuAction) => cb(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  }
};

contextBridge.exposeInMainWorld('mdedit', api);
