import { promises as fs } from 'node:fs';
import { writeFileAtomic } from './files';

export interface Settings {
  lastFolder?: string;
}

export async function loadSettings(file: string): Promise<Settings> {
  try {
    const data: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    if (data && typeof data === 'object' && typeof (data as Settings).lastFolder === 'string') {
      return { lastFolder: (data as Settings).lastFolder };
    }
  } catch {
    // missing or corrupt settings: start fresh
  }
  return {};
}

export async function saveSettings(file: string, settings: Settings): Promise<void> {
  await writeFileAtomic(file, JSON.stringify(settings, null, 2));
}

/** The remembered folder, but only if it still exists and is a directory. */
export async function existingLastFolder(file: string): Promise<string | null> {
  const { lastFolder } = await loadSettings(file);
  if (!lastFolder) return null;
  try {
    return (await fs.stat(lastFolder)).isDirectory() ? lastFolder : null;
  } catch {
    return null;
  }
}
