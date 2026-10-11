import { homedir } from 'node:os';
import path from 'node:path';
import type { FsPort } from '../src/shared/fsPort';

/** Folders where MDEdit keeps `settings.json`, by platform (Electron's per-user data folder). */
export function settingsCandidates(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string): string[] {
  const bases =
    platform === 'win32'
      ? [env.APPDATA ?? path.join(home, 'AppData', 'Roaming')]
      : platform === 'darwin'
        ? [path.join(home, 'Library', 'Application Support')]
        : [env.XDG_CONFIG_HOME ?? path.join(home, '.config')];
  return bases.flatMap((b) => [path.join(b, 'MDEdit', 'settings.json'), path.join(b, 'mdedit', 'settings.json')]);
}

/**
 * Where the projects are: `--root`, then `MDEDIT_ROOT`, then the Root Folder chosen in MDEdit, then the default
 * (`~/MDEdit`). So once MDEdit has been set up, the server needs no configuration.
 */
export async function resolveRoot(
  o: { flag?: string; env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; home?: string; fs: FsPort }
): Promise<{ root: string; source: string }> {
  const env = o.env ?? process.env;
  if (o.flag?.trim()) return { root: path.resolve(o.flag.trim()), source: '--root' };
  if (env.MDEDIT_ROOT?.trim()) return { root: path.resolve(env.MDEDIT_ROOT.trim()), source: 'MDEDIT_ROOT' };
  const home = o.home ?? homedir();
  for (const file of settingsCandidates(env, o.platform ?? process.platform, home)) {
    try {
      const root = (JSON.parse(await o.fs.readText(file)) as { projects?: { rootFolder?: unknown } }).projects?.rootFolder;
      if (typeof root === 'string' && root.trim()) return { root: root.trim(), source: `MDEdit settings (${file})` };
    } catch {
      /* not there: try the next */
    }
  }
  return { root: path.join(home, 'MDEdit'), source: 'default' };
}
