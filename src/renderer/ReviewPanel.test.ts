// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewPanel } from './ReviewPanel';
import type { ReviewState, ShownItem } from './useReview';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const note = (id: string, o: Partial<ShownItem> = {}): ShownItem => ({
  id, kind: 'comment', file: 'f.md', anchor: { quote: `text of ${id}`, prefix: '', suffix: '', start: 0 }, body: `body ${id}`, status: 'open', author: 'Claude', createdAt: id, updatedAt: id, replies: [],
  reviewerId: 'ai-claude', reviewerName: 'Claude', ...o,
});
const state = (items: ShownItem[]): ReviewState => ({
  items, detached: new Set(), add: vi.fn(), selection: () => null, setStatus: vi.fn(async () => undefined), reply: vi.fn(async () => undefined), remove: vi.fn(async () => undefined),
  accept: vi.fn(async () => null), focus: vi.fn(), reload: vi.fn(),
});

let host: HTMLDivElement;
let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  scrollTo = vi.fn();
  HTMLElement.prototype.scrollTo = scrollTo as never;
});
afterEach(() => host.remove());

const render = async (items: ShownItem[], focus: { id: string; n: number } | null) => {
  const root = createRoot(host);
  const props = (f: typeof focus) => ({ state: state(items), me: { id: 'owner', name: 'Me' }, role: 'owner' as const, onRename: () => undefined, onClose: () => undefined, focus: f });
  await act(async () => root.render(createElement(ReviewPanel, props(focus))));
  return { root, again: (f: typeof focus) => act(async () => root.render(createElement(ReviewPanel, props(f)))) };
};
const rows = () => [...host.querySelectorAll<HTMLElement>('[data-note-id]')];
const focused = () => host.querySelector<HTMLElement>('.review-item.focused')?.dataset.noteId;

describe('clicking the text of a note', () => {
  it('marks that note in the list and scrolls it to the top', async () => {
    const items = ['a', 'b', 'c'].map((id) => note(id));
    const { again, root } = await render(items, null);
    expect(focused()).toBeUndefined();
    await again({ id: 'c', n: 1 });
    expect(focused()).toBe('c');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect((scrollTo.mock.calls[0][0] as { top: number }).top).toBe(0); // jsdom has no layout: the offset arithmetic is exercised in the browser
    expect(host.querySelector('.review-list')?.className).toContain('has-focus'); // room below the last note so it can reach the top
    await again({ id: 'a', n: 2 });
    expect(focused()).toBe('a');
    expect(scrollTo).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  it('shows the note even when a filter or "finished" would hide it', async () => {
    const items = [note('a'), note('b', { reviewerId: 'sam', reviewerName: 'Sam', category: 'style' }), note('c', { status: 'resolved' })];
    const { again, root } = await render(items, null);
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Show notes from"]')!;
    await act(async () => {
      select.value = 'sam';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(rows().map((r) => r.dataset.noteId)).toEqual(['b']);
    await again({ id: 'a', n: 1 }); // another reviewer's note
    expect(rows().map((r) => r.dataset.noteId)).toContain('a');
    expect(focused()).toBe('a');
    await again({ id: 'c', n: 2 }); // a finished note
    expect(rows().map((r) => r.dataset.noteId)).toContain('c');
    expect(focused()).toBe('c');
    await act(async () => root.unmount());
  });

  it('ignores a note that is not in the list', async () => {
    const { again, root } = await render([note('a')], null);
    await again({ id: 'zzz', n: 1 });
    expect(focused()).toBeUndefined();
    expect(scrollTo).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
