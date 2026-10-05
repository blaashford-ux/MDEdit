import { promises as fs } from 'node:fs';

/** Writes via a temp file + rename so a crash mid-write can't leave a truncated .md. */
export async function writeFileAtomic(target: string, content: string): Promise<void> {
  const tmp = `${target}.mdedit-${process.pid}.tmp`;
  try {
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, target);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}
