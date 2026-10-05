import { beforeEach, describe, expect, it } from 'vitest';
import { FakeApi } from './testing/fakeApi';
import { Workspace } from './workspace';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ROOT = '/proj';
const A = `${ROOT}/a.md`;
const B = `${ROOT}/sub/b.md`;
const BOOK = '# One\nfirst\n\n# Two\nsecond\n\n# Three\nthird\n';

let api: FakeApi;
let ws: Workspace;
const state = () => ws.getState();
const tabOf = (file: string) => state().tabs.find((t) => t.file === file)!;

beforeEach(async () => {
  api = new FakeApi(ROOT);
  api.add('a.md', BOOK);
  api.add('sub/b.md', '# Bee\nbuzz\n');
  ws = new Workspace(api, { draftDelayMs: 5, sessionDelayMs: 5 });
  await ws.openPath(ROOT);
});

describe('tabs', () => {
  it('opens one tab per file and reuses it for other chapters of the same file', async () => {
    await ws.openChapter(A, 1);
    await ws.openChapter(B, 0);
    expect(state().tabs.map((t) => [t.file, t.chapter])).toEqual([[A, 1], [B, 0]]);
    expect(state().activeId).toBe(tabOf(B).id);
    await ws.openChapter(A, 2);
    expect(state().tabs).toHaveLength(2);
    expect(tabOf(A).chapter).toBe(2);
    expect(state().activeId).toBe(tabOf(A).id);
  });

  it('switching tabs never prompts and keeps each tab’s unsaved edits', async () => {
    await ws.openChapter(A, 0);
    await ws.openChapter(B, 0);
    ws.setDraft(tabOf(A).id, '# One\nEDITED');
    ws.setDraft(tabOf(B).id, '# Bee\nBUZZ');
    ws.activateTab(tabOf(A).id);
    ws.cycleTab(1);
    ws.cycleTab(1);
    expect(api.unsavedAsked).toEqual([]);
    expect(tabOf(A).draft).toBe('# One\nEDITED');
    expect(tabOf(B).draft).toBe('# Bee\nBUZZ');
  });

  it('switching chapter inside a dirty tab prompts; Cancel stays, Don’t Save moves on', async () => {
    await ws.openChapter(A, 0);
    ws.setDraft(tabOf(A).id, '# One\nEDITED');
    await ws.openChapter(A, 1); // default answer: cancel
    expect(api.unsavedAsked).toEqual(['a.md']);
    expect(tabOf(A).chapter).toBe(0);
    expect(tabOf(A).draft).not.toBeNull();
    api.unsavedAnswers = ['discard'];
    await ws.openChapter(A, 1);
    expect(tabOf(A).chapter).toBe(1);
    expect(tabOf(A).draft).toBeNull();
    expect(api.text(A)).toBe(BOOK);
  });

  it('closing a clean tab does not prompt; closing a dirty one does', async () => {
    await ws.openChapter(A, 0);
    await ws.openChapter(B, 0);
    expect(await ws.closeTab(tabOf(B).id)).toBe(true);
    expect(api.unsavedAsked).toEqual([]);

    ws.setDraft(tabOf(A).id, '# One\nEDITED');
    expect(await ws.closeTab(tabOf(A).id)).toBe(false); // Cancel
    expect(state().tabs).toHaveLength(1);

    api.unsavedAnswers = ['save'];
    expect(await ws.closeTab(tabOf(A).id)).toBe(true);
    expect(state().tabs).toHaveLength(0);
    expect(state().activeId).toBeNull();
    expect(api.text(A)).toContain('EDITED');
  });

  it('Don’t Save on close discards the edit and the recovery draft', async () => {
    await ws.openChapter(A, 0);
    ws.setDraft(tabOf(A).id, '# One\nEDITED');
    await sleep(30);
    expect(api.drafts.has(A)).toBe(true);
    api.unsavedAnswers = ['discard'];
    expect(await ws.closeTab(tabOf(A).id)).toBe(true);
    await sleep(10);
    expect(api.text(A)).toBe(BOOK);
    expect(api.drafts.has(A)).toBe(false);
  });

  it('activates a neighbour when the active tab closes', async () => {
    await ws.openChapter(A, 0);
    await ws.openChapter(B, 0);
    await ws.openChapter(`${ROOT}/sub/b.md`, 0);
    api.add('c.md', '# C\n');
    await ws.refresh();
    await ws.openChapter(`${ROOT}/c.md`, 0);
    // tabs: A, B, C (C active)
    await ws.closeTab(tabOf(`${ROOT}/c.md`).id);
    expect(state().activeId).toBe(tabOf(B).id);
    ws.activateTab(tabOf(A).id);
    await ws.closeTab(tabOf(A).id);
    expect(state().activeId).toBe(tabOf(B).id);
  });

  it('reports the unsaved file names to the main process', async () => {
    await ws.openChapter(A, 0);
    await ws.openChapter(B, 0);
    ws.setDraft(tabOf(B).id, 'x');
    ws.setDraft(tabOf(A).id, 'y');
    ws.setDraft(tabOf(B).id, null);
    expect(api.dirtyReports.at(-1)).toEqual(['a.md']);
    ws.setDraft(tabOf(A).id, null);
    expect(api.dirtyReports.at(-1)).toEqual([]);
  });

  it('chapter navigation steps within the file and stops at the ends', async () => {
    await ws.openChapter(A, 0);
    await ws.gotoChapter(-1);
    expect(tabOf(A).chapter).toBe(0);
    await ws.gotoChapter(1);
    await ws.gotoChapter(1);
    await ws.gotoChapter(1);
    expect(tabOf(A).chapter).toBe(2);
  });
});

describe('window close / change folder', () => {
  it('walks every dirty tab; Cancel on any aborts', async () => {
    await ws.openChapter(A, 0);
    await ws.openChapter(B, 0);
    ws.setDraft(tabOf(A).id, 'a!');
    ws.setDraft(tabOf(B).id, 'b!');
    await sleep(30); // both edits autosaved for recovery
    api.unsavedAnswers = ['discard', 'cancel'];
    expect(await ws.handleCloseRequest()).toBe(false);
    expect(api.unsavedAsked).toEqual(['a.md', 'b.md']);
    // cancelling part-way throws nothing away: the edits and their recovery drafts are intact
    expect(tabOf(A).draft).toBe('a!');
    expect(api.drafts.has(A)).toBe(true);
    api.unsavedAnswers = ['discard', 'discard'];
    expect(await ws.handleCloseRequest()).toBe(true);
    expect(api.drafts.size).toBe(0);
  });

  it('close with nothing unsaved asks nothing', async () => {
    await ws.openChapter(A, 0);
    expect(await ws.handleCloseRequest()).toBe(true);
    expect(api.unsavedAsked).toEqual([]);
  });

  it('changing folder prompts for unsaved tabs first', async () => {
    await ws.openChapter(A, 0);
    ws.setDraft(tabOf(A).id, 'x');
    api.pickResult = '/other';
    await ws.openFolder(); // cancel
    expect(state().root?.path).toBe(ROOT);
    api.unsavedAnswers = ['discard'];
    api.add('zzz.md', '# Z\n'); // keeps /proj non-empty; /other is empty
    await ws.openFolder();
    expect(state().root?.path).toBe('/other');
    expect(state().tabs).toEqual([]);
  });
});

describe('saving', () => {
  it('writes only the edited chapter and clears the draft', async () => {
    await ws.openChapter(A, 1);
    ws.setDraft(tabOf(A).id, '# Two\nSECOND');
    expect(await ws.save(tabOf(A).id)).toBe(true);
    expect(api.text(A)).toBe('# One\nfirst\n\n# Two\nSECOND\n\n# Three\nthird\n');
    expect(tabOf(A).draft).toBeNull();
    expect(tabOf(A).saved?.version).toBe(1);
  });

  it('saving a tab does not touch other tabs', async () => {
    await ws.openChapter(A, 0);
    await ws.openChapter(B, 0);
    ws.setDraft(tabOf(A).id, '# One\nX');
    ws.setDraft(tabOf(B).id, '# Bee\nY');
    await ws.save(tabOf(A).id);
    expect(tabOf(B).draft).toBe('# Bee\nY');
    expect(api.text(B)).toBe('# Bee\nbuzz\n');
  });

  it('keeps edits made while the save was in flight', async () => {
    await ws.openChapter(A, 0);
    ws.setDraft(tabOf(A).id, '# One\nv1');
    const saving = ws.save(tabOf(A).id);
    ws.setDraft(tabOf(A).id, '# One\nv2');
    await saving;
    expect(tabOf(A).draft).toBe('# One\nv2');
  });

  it('adding a Heading 1 splits the file and reloads the editor with no duplication', async () => {
    await ws.openChapter(A, 1);
    const before = tabOf(A).reloadKey;
    ws.setDraft(tabOf(A).id, '# Two\nsecond\n\n# Two-b\nextra');
    await ws.save(tabOf(A).id);
    expect(state().docs.get(A)!.chapters.map((c) => c.title)).toEqual(['One', 'Two', 'Two-b', 'Three']);
    expect(tabOf(A).reloadKey).toBe(before + 1);
    expect(tabOf(A).draft).toBeNull();
    expect(api.text(A)!.match(/extra/g)).toHaveLength(1);
  });

  it('a failing Save keeps the draft and the tab', async () => {
    await ws.openChapter(A, 0);
    ws.setDraft(tabOf(A).id, '# One\nX');
    api.writeFile = async () => {
      throw new Error('disk full');
    };
    expect(await ws.save(tabOf(A).id)).toBe(false);
    expect(state().error).toMatch(/disk full/);
    expect(tabOf(A).draft).not.toBeNull();
    api.unsavedAnswers = ['save'];
    expect(await ws.closeTab(tabOf(A).id)).toBe(false); // Save failed ⇒ tab stays open
  });
});

describe('changes made outside the app', () => {
  it('reloads a clean tab silently with a notice', async () => {
    await ws.openChapter(A, 0);
    api.external(A, '# One\nEXT\n');
    await ws.checkAllOpenFiles();
    expect(state().docs.get(A)!.chapters).toHaveLength(1);
    expect(state().notice).toMatch(/a\.md changed on disk/);
    expect(tabOf(A).conflict).toBeNull();
  });

  it('ignores a touch with identical content', async () => {
    await ws.openChapter(A, 0);
    api.external(A, BOOK);
    await ws.checkAllOpenFiles();
    expect(state().notice).toBeNull();
    expect(tabOf(A).reloadKey).toBe(0);
  });

  it('raises a conflict on the right tab only when it has unsaved edits', async () => {
    await ws.openChapter(A, 0);
    await ws.openChapter(B, 0);
    ws.setDraft(tabOf(A).id, '# One\nMINE');
    api.external(A, '# One\nTHEIRS\n');
    api.external(B, '# Bee\nTHEIRS\n');
    await ws.checkAllOpenFiles();
    expect(tabOf(A).conflict?.kind).toBe('changed');
    expect(tabOf(A).draft).toBe('# One\nMINE');
    expect(tabOf(B).conflict).toBeNull(); // clean tab simply reloaded
    expect(state().docs.get(B)!.chapters[0].raw).toContain('THEIRS');
  });

  it('Reload discards my edits; Keep lets me save over without another prompt', async () => {
    await ws.openChapter(A, 0);
    ws.setDraft(tabOf(A).id, '# One\nMINE');
    api.external(A, '# One\nTHEIRS\n');
    await ws.checkAllOpenFiles();
    ws.resolveConflict(tabOf(A).id, 'reload');
    expect(tabOf(A).draft).toBeNull();
    expect(api.drafts.has(A)).toBe(false);

    ws.setDraft(tabOf(A).id, '# One\nMINE2');
    api.external(A, '# One\nTHEIRS2\n');
    await ws.checkAllOpenFiles();
    ws.resolveConflict(tabOf(A).id, 'keep');
    api.overwriteAnswers = [false]; // would block if asked
    expect(await ws.save(tabOf(A).id)).toBe(true);
    expect(api.text(A)).toContain('MINE2');
  });

  it('saving over an unseen outside change asks first', async () => {
    await ws.openChapter(A, 0);
    ws.setDraft(tabOf(A).id, '# One\nMINE');
    api.external(A, '# One\nTHEIRS\n');
    api.overwriteAnswers = [false];
    expect(await ws.save(tabOf(A).id)).toBe(false);
    expect(api.text(A)).toBe('# One\nTHEIRS\n');
    api.overwriteAnswers = [true];
    expect(await ws.save(tabOf(A).id)).toBe(true);
    expect(api.text(A)).toContain('MINE');
  });

  it('flags a deleted file', async () => {
    await ws.openChapter(A, 0);
    api.files.delete(A);
    await ws.checkAllOpenFiles();
    expect(tabOf(A).conflict?.kind).toBe('missing');
    ws.resolveConflict(tabOf(A).id, 'dismiss');
    expect(tabOf(A).conflict).toBeNull();
  });
});

describe('refresh', () => {
  it('picks up new and removed files and keeps unsaved edits', async () => {
    await ws.openChapter(A, 0);
    ws.setDraft(tabOf(A).id, '# One\nMINE');
    api.add('new.md', '# N\n');
    api.files.delete(B);
    await ws.refresh();
    const names = state().root!.children.map((c) => c.name);
    expect(names).toContain('new.md');
    expect(names).toContain('sub'); // the folder is still on disk, now empty
    expect(tabOf(A).draft).toBe('# One\nMINE');
  });
});

describe('autosave drafts and recovery', () => {
  it('autosaves unsaved edits after a short delay and clears them on save', async () => {
    await ws.openChapter(A, 1);
    ws.setDraft(tabOf(A).id, '# Two\nDRAFT');
    expect(api.drafts.has(A)).toBe(false);
    await sleep(40);
    expect(api.drafts.get(A)).toMatchObject({ chapter: 1, title: 'Two', markdown: '# Two\nDRAFT' });
    expect(tabOf(A).autosavedAt).not.toBeNull();
    await ws.save(tabOf(A).id);
    await sleep(10);
    expect(api.drafts.has(A)).toBe(false);
  });

  it('a save that lands while the autosave write is in flight leaves no stale draft', async () => {
    await ws.openChapter(A, 0);
    const slow = api.saveDraft;
    api.saveDraft = async (d) => {
      await sleep(20);
      return slow(d);
    };
    ws.setDraft(tabOf(A).id, '# One\nX');
    await sleep(10); // autosave started, still writing
    await ws.save(tabOf(A).id);
    await sleep(60);
    expect(api.drafts.has(A)).toBe(false);
  });

  it('restores an autosaved draft as unsaved edits on the right chapter', async () => {
    api.drafts.set(A, { file: A, chapter: 1, title: 'Two', markdown: '# Two\nRECOVERED', updatedAt: 1 });
    await ws.openPath(ROOT, true);
    expect(tabOf(A).chapter).toBe(1);
    expect(tabOf(A).draft).toBe('# Two\nRECOVERED');
    expect(state().notice).toMatch(/Recovered/);
    expect(api.text(A)).toBe(BOOK); // nothing written until the user saves
  });

  it('finds the chapter by title if the numbering moved', async () => {
    api.drafts.set(A, { file: A, chapter: 0, title: 'Three', markdown: '# Three\nR', updatedAt: 1 });
    await ws.openPath(ROOT, true);
    expect(tabOf(A).chapter).toBe(2);
  });

  it('Discard throws the draft away', async () => {
    api.drafts.set(A, { file: A, chapter: 0, title: 'One', markdown: 'x', updatedAt: 1 });
    api.recoverAnswers = [false];
    await ws.openPath(ROOT, true);
    expect(state().tabs).toEqual([]);
    expect(api.drafts.size).toBe(0);
  });

  it('keeps the text as a new file when its chapter no longer exists', async () => {
    api.drafts.set(A, { file: A, chapter: 1, title: 'Deleted Chapter', markdown: '# Deleted Chapter\nprecious', updatedAt: 1 });
    await ws.openPath(ROOT, true);
    expect(api.text(`${ROOT}/a (recovered).md`)).toBe('# Deleted Chapter\nprecious');
    expect(api.drafts.size).toBe(0);
    expect(api.text(A)).toBe(BOOK);
  });

  it('ignores drafts of vanished files and of other folders', async () => {
    api.drafts.set(`${ROOT}/gone.md`, { file: `${ROOT}/gone.md`, chapter: 0, title: '', markdown: 'x', updatedAt: 1 });
    api.drafts.set('/elsewhere/z.md', { file: '/elsewhere/z.md', chapter: 0, title: '', markdown: 'x', updatedAt: 1 });
    await ws.openPath(ROOT, true);
    expect(api.drafts.has(`${ROOT}/gone.md`)).toBe(false);
    expect(api.drafts.has('/elsewhere/z.md')).toBe(true);
    expect(state().tabs).toEqual([]);
  });
});

describe('session restore', () => {
  it('saves the layout and brings it back, skipping files that vanished', async () => {
    await ws.openChapter(A, 2);
    await ws.openChapter(B, 0);
    ws.setMode(tabOf(B).id, 'source');
    await ws.toggleExpanded(`${ROOT}/sub`, false);
    ws.activateTab(tabOf(A).id);
    ws.flushSessionNow();
    const saved = api.sessions.get(ROOT)!;
    expect(saved.tabs.map((t) => [t.file, t.chapter, t.mode])).toEqual([[A, 2, 'visual'], [B, 0, 'source']]);
    expect(saved.active).toBe(A);

    api.sessions.set(ROOT, { ...saved, tabs: [...saved.tabs, { file: `${ROOT}/ghost.md`, chapter: 0, mode: 'visual' }] });
    const again = new Workspace(api, { draftDelayMs: 5, sessionDelayMs: 5 });
    await again.init();
    const s = again.getState();
    expect(s.tabs.map((t) => [t.file, t.chapter, t.mode])).toEqual([[A, 2, 'visual'], [B, 0, 'source']]);
    expect(s.tabs.find((t) => t.id === s.activeId)!.file).toBe(A);
    expect(s.expanded.has(`${ROOT}/sub`)).toBe(true);
  });

  it('clamps a remembered chapter that no longer exists', async () => {
    api.sessions.set(ROOT, { tabs: [{ file: A, chapter: 99, mode: 'visual' }], active: A, expanded: [] });
    await ws.openPath(ROOT, true);
    expect(tabOf(A).chapter).toBe(2);
  });

  it('remembers the sidebar width', async () => {
    api.prefs = { sidebarWidth: 410 };
    const again = new Workspace(api);
    await again.init();
    expect(again.getState().sidebarWidth).toBe(410);
    again.setSidebarWidth(5000, true);
    expect(api.prefs.sidebarWidth).toBe(640);
    again.setSidebarWidth(10, true);
    expect(api.prefs.sidebarWidth).toBe(180);
  });
});

describe('file operations', () => {
  it('creates a file with a starting heading, expands its folder and opens it', async () => {
    expect(await ws.createFile(`${ROOT}/sub`, 'ideas')).toBe(true);
    expect(api.text(`${ROOT}/sub/ideas.md`)).toBe('# ideas\n\n');
    expect(state().tabs.map((t) => t.file)).toContain(`${ROOT}/sub/ideas.md`);
    expect(state().expanded.has(`${ROOT}/sub`)).toBe(true);
  });

  it('reports a name clash without opening anything', async () => {
    expect(await ws.createFile(ROOT, 'a')).toBe(false);
    expect(state().error).toMatch(/already exists/);
    expect(state().tabs).toEqual([]);
  });

  it('renaming a file keeps its tab, unsaved edits and chapter', async () => {
    await ws.openChapter(A, 1);
    ws.setDraft(tabOf(A).id, '# Two\nWIP');
    expect(await ws.renameNode(A, 'renamed')).toBe(true);
    const t = state().tabs[0];
    expect(t.file).toBe(`${ROOT}/renamed.md`);
    expect(t.draft).toBe('# Two\nWIP');
    expect(t.chapter).toBe(1);
    expect(state().docs.has(`${ROOT}/renamed.md`)).toBe(true);
    expect(state().docs.has(A)).toBe(false);
    await ws.save(t.id);
    expect(api.text(`${ROOT}/renamed.md`)).toContain('WIP');
  });

  it('renaming a folder moves every open file inside it', async () => {
    await ws.openChapter(B, 0);
    await ws.toggleExpanded(`${ROOT}/sub`, false);
    await ws.renameNode(`${ROOT}/sub`, 'deeper');
    expect(state().tabs[0].file).toBe(`${ROOT}/deeper/b.md`);
    expect(state().expanded.has(`${ROOT}/deeper`)).toBe(true);
  });

  it('deleting asks first, closes the file’s tabs (even unsaved) and trashes it', async () => {
    await ws.openChapter(A, 0);
    await ws.openChapter(B, 0);
    ws.setDraft(tabOf(B).id, 'x');
    api.deleteAnswers = [false];
    expect(await ws.deleteNode(`${ROOT}/sub`, 'folder')).toBe(false);
    expect(state().tabs).toHaveLength(2);
    api.deleteAnswers = [true];
    expect(await ws.deleteNode(`${ROOT}/sub`, 'folder')).toBe(true);
    expect(api.trashed).toEqual([`${ROOT}/sub`]);
    expect(state().tabs.map((t) => t.file)).toEqual([A]);
    expect(api.unsavedAsked).toEqual([]); // the delete confirmation already warned about it
  });

  it('a failed trash leaves tabs untouched', async () => {
    await ws.openChapter(A, 0);
    api.failTrash = true;
    expect(await ws.deleteNode(A, 'file')).toBe(false);
    expect(state().tabs).toHaveLength(1);
    expect(state().error).toMatch(/trash unavailable/);
  });
});

describe('folders', () => {
  it('shows empty folders', async () => {
    api.addDir('empty');
    await ws.refresh();
    const empty = state().root!.children.find((c) => c.name === 'empty');
    expect(empty).toMatchObject({ kind: 'dir', children: [] });
  });

  it('creates a folder, refreshes the tree and reveals it', async () => {
    await ws.toggleExpanded(`${ROOT}/sub`, false);
    const p = await ws.createFolder(`${ROOT}/sub`, '  chapters ');
    expect(p).toBe(`${ROOT}/sub/chapters`);
    const sub = state().root!.children.find((c) => c.name === 'sub') as { children: { name: string }[] };
    expect(sub.children.map((c) => c.name)).toContain('chapters');
  });

  it('expands the parents of a folder created deep inside a collapsed tree', async () => {
    await ws.createFolder(`${ROOT}/sub`, 'inner');
    expect(state().expanded.has(`${ROOT}/sub`)).toBe(true);
  });

  it('reports a clash and returns null', async () => {
    api.addDir('dup');
    expect(await ws.createFolder(ROOT, 'dup')).toBeNull();
    expect(state().error).toMatch(/already exists/);
  });

  it('a new empty folder can receive a file straight away', async () => {
    const dir = (await ws.createFolder(ROOT, 'fresh'))!;
    expect(await ws.createFile(dir, 'first')).toBe(true);
    expect(api.text(`${ROOT}/fresh/first.md`)).toBe('# first\n\n');
  });

  it('renames and deletes an empty folder', async () => {
    const dir = (await ws.createFolder(ROOT, 'tmp'))!;
    expect(await ws.renameNode(dir, 'tmp2')).toBe(true);
    expect(state().root!.children.map((c) => c.name)).toContain('tmp2');
    expect(await ws.deleteNode(`${ROOT}/tmp2`, 'folder')).toBe(true);
    expect(state().root!.children.map((c) => c.name)).not.toContain('tmp2');
  });
});

describe('chapter structure from the sidebar', () => {
  it('adds a chapter after another and opens it', async () => {
    expect(await ws.newChapter(A, 0, 'Interlude')).toBe(true);
    expect(api.text(A)).toBe('# One\nfirst\n\n# Interlude\n\n# Two\nsecond\n\n# Three\nthird\n');
    expect(tabOf(A).chapter).toBe(1);
    expect(state().docs.get(A)!.chapters.map((c) => c.title)).toEqual(['One', 'Interlude', 'Two', 'Three']);
  });

  it('moves a chapter, and the open tab follows the chapter it was showing', async () => {
    await ws.openChapter(A, 1); // Two
    expect(await ws.moveChapter(A, 1, 1)).toBe(2);
    expect(state().docs.get(A)!.chapters.map((c) => c.title)).toEqual(['One', 'Three', 'Two']);
    expect(tabOf(A).chapter).toBe(2); // still on Two
    expect(await ws.moveChapter(A, 2, -1)).toBe(1);
    expect(tabOf(A).chapter).toBe(1);
  });

  it('a tab on the neighbour that got swapped follows it too', async () => {
    await ws.openChapter(A, 2); // Three
    await ws.moveChapter(A, 1, 1); // Two <-> Three
    expect(tabOf(A).chapter).toBe(1); // Three is now at 1
  });

  it('refuses impossible moves without touching the file', async () => {
    expect(await ws.moveChapter(A, 0, -1)).toBeNull();
    expect(api.writes).toEqual([]);
  });

  it('deleting a chapter asks first, then removes it and shifts the open tab', async () => {
    await ws.openChapter(A, 2);
    api.deleteAnswers = [false];
    expect(await ws.deleteChapter(A, 0)).toBe(false);
    expect(api.writes).toEqual([]);
    expect(await ws.deleteChapter(A, 0)).toBe(true);
    expect(state().docs.get(A)!.chapters.map((c) => c.title)).toEqual(['Two', 'Three']);
    expect(tabOf(A).chapter).toBe(1); // still on Three
  });

  it('resolves unsaved edits in that file first', async () => {
    await ws.openChapter(A, 0);
    ws.setDraft(tabOf(A).id, '# One\nWIP');
    await ws.moveChapter(A, 1, 1); // default: cancel
    expect(api.writes).toEqual([]);
    api.unsavedAnswers = ['save'];
    await ws.moveChapter(A, 1, 1);
    expect(api.text(A)).toContain('WIP');
    expect(state().docs.get(A)!.chapters.map((c) => c.title)).toEqual(['One', 'Three', 'Two']);
  });
});
