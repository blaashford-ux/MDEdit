import { describe, expect, it, vi } from 'vitest';
import { guardLeave } from './leaveGuard';

const setup = (choice: 'save' | 'discard' | 'cancel', saveOk = true) => ({
  ask: vi.fn(async () => choice),
  save: vi.fn(async () => saveOk)
});

describe('guardLeave', () => {
  it('lets you leave a clean chapter without asking', async () => {
    const { ask, save } = setup('cancel');
    expect(await guardLeave(false, ask, save)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('Cancel stays', async () => {
    const { ask, save } = setup('cancel');
    expect(await guardLeave(true, ask, save)).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("Don't Save leaves without saving", async () => {
    const { ask, save } = setup('discard');
    expect(await guardLeave(true, ask, save)).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('Save leaves only if the save succeeded', async () => {
    const ok = setup('save', true);
    expect(await guardLeave(true, ok.ask, ok.save)).toBe(true);
    const failing = setup('save', false);
    expect(await guardLeave(true, failing.ask, failing.save)).toBe(false);
    expect(failing.save).toHaveBeenCalledOnce();
  });
});
