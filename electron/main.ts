import { app, BrowserWindow } from 'electron';
import path from 'node:path';

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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
