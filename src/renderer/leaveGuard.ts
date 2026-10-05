import type { UnsavedChoice } from '../shared/api';

/**
 * Decides whether it is OK to leave the open chapter (switch chapter/file, change folder).
 * Clean → yes. Dirty → ask; Save only counts if the save actually succeeded.
 */
export async function guardLeave(
  dirty: boolean,
  ask: () => Promise<UnsavedChoice>,
  save: () => Promise<boolean>
): Promise<boolean> {
  if (!dirty) return true;
  const choice = await ask();
  if (choice === 'cancel') return false;
  if (choice === 'discard') return true;
  return save();
}
