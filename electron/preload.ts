import { contextBridge, ipcRenderer } from 'electron';
import type { MdeditApi } from '../src/shared/api';

const api: MdeditApi = {
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  scanFolder: (root) => ipcRenderer.invoke('fs:scanFolder', root),
  readFile: (p) => ipcRenderer.invoke('fs:readFile', p),
  writeFile: (p, content) => ipcRenderer.invoke('fs:writeFile', p, content)
};

contextBridge.exposeInMainWorld('mdedit', api);
