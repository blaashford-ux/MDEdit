import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { createRoot } from 'react-dom/client';
import { MOBILE_CAPABILITIES, type MdeditApi } from '../shared/api';
import { createCoreApi } from '../shared/backend/coreApi';
import type { FsPort } from '../shared/fsPort';
import { App } from '../renderer/App';
import { createCapacitorFs, type FilesystemLike } from './capacitorFs';
import { DialogHost, mobileDialogs } from './dialogs';
import { seededPreviewFs } from './sampleProject';
import { desktopOnlyStubs } from './stubs';

const ROOT = '/MDEdit';
const STATE = '/state';

/** On the phone: app-private storage. In a plain browser (development): an in-memory library, so the UI can be tried without a device. */
function storage(): FsPort {
  return Capacitor.isNativePlatform() ? createCapacitorFs(Filesystem as unknown as FilesystemLike) : seededPreviewFs();
}

async function start(): Promise<void> {
  const fs = storage();
  await fs.mkdir(ROOT, { recursive: true });
  await fs.mkdir(STATE, { recursive: true });
  const backend = createCoreApi({
    fs,
    rootFolder: ROOT,
    settingsFile: `${STATE}/settings.json`,
    draftsDir: `${STATE}/drafts`,
    trashDir: `${STATE}/trash`,
    dialogs: mobileDialogs,
  });
  await backend.load();
  window.mdedit = { ...backend.api, ...desktopOnlyStubs, capabilities: MOBILE_CAPABILITIES } satisfies MdeditApi;

  // Going to the background must not lose recent settings or autosaved drafts.
  void CapacitorApp.addListener('pause', () => void backend.flush());

  createRoot(document.getElementById('root')!).render(
    <>
      <App />
      <DialogHost />
    </>
  );
}

void start();
