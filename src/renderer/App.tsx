import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MenuAction } from '../shared/api';
import { basename, dirname, validateName } from '../shared/paths';
import { collectOrphans, findNode } from '../shared/tree';
import { countWords } from '../shared/words';
import { BookDetailsDialog } from './BookDetailsDialog';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { Editor } from './Editor';
import { PromptDialog, type PromptSpec } from './PromptDialog';
import { RelinkDialog } from './RelinkDialog';
import { SourceEditor } from './SourceEditor';
import { StatusBar } from './StatusBar';
import { Tabs } from './Tabs';
import { Tree } from './Tree';
import { buildRows, chapterKey, chapterLabel, type Row } from './treeRows';
import { useWorkspace } from './useWorkspace';
import { Workspace } from './workspace';
import './styles.css';

const POLL_MS = 2000;

export function App() {
  const [ws] = useState(() => new Workspace(window.mdedit));
  const s = useWorkspace(ws);
  const [filter, setFilter] = useState('');
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; row: Row } | null>(null);
  const [prompt, setPrompt] = useState<PromptSpec | null>(null);
  const [bookFile, setBookFile] = useState<string | null>(null);
  const [relink, setRelink] = useState<string | null>(null);
  const [ignoredOrphans, setIgnoredOrphans] = useState<Set<string>>(new Set());
  const filterRef = useRef<HTMLInputElement>(null);

  const activeTab = s.tabs.find((t) => t.id === s.activeId);
  const activeDoc = activeTab ? s.docs.get(activeTab.file) : undefined;
  const activeChapter = activeDoc?.chapters[activeTab?.chapter ?? 0];
  const activeKey = activeTab ? chapterKey(activeTab.file, activeTab.chapter) : null;

  const rows = useMemo(
    () => (s.root ? buildRows(s.root, s.expanded, s.docs, filter) : []),
    [s.root, s.expanded, s.docs, filter]
  );
  const orphan = useMemo(
    () => (s.root ? collectOrphans(s.root).find((o) => !ignoredOrphans.has(o)) : undefined),
    [s.root, ignoredOrphans]
  );
  const relinkCandidates = useMemo(() => {
    if (!relink || !s.root) return [];
    const dir = findNode(s.root, dirname(relink));
    return dir && dir.kind === 'dir'
      ? dir.children.filter((c) => c.kind === 'file' && c.marked === undefined && !c.exportBlocked).map((c) => ({ name: c.name, path: c.path }))
      : [];
  }, [relink, s.root]);
  const dirtyFiles = useMemo(() => new Set(s.tabs.filter((t) => t.draft !== null).map((t) => t.file)), [s.tabs]);

  // ---- lifecycle -------------------------------------------------------------------------

  useEffect(() => {
    void ws.init();
    const stopClose = window.mdedit.onCloseRequested(() => {
      void ws.handleCloseRequest().then((ok) => window.mdedit.reportCloseDecision(ok));
    });
    return stopClose;
  }, [ws]);

  // Notice edits made outside the app (Dropbox sync, another editor, git checkout...).
  useEffect(() => {
    const check = () => void ws.checkAllOpenFiles();
    const timer = setInterval(check, POLL_MS);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [ws]);

  useEffect(() => {
    const dirty = activeTab?.draft !== null && activeTab !== undefined;
    document.title = activeTab
      ? `${activeChapter ? chapterLabel(activeChapter) + ' — ' : ''}${basename(activeTab.file)}${dirty ? ' ●' : ''} — MDEdit`
      : 'MDEdit';
  }, [activeTab, activeChapter]);

  // ---- actions ---------------------------------------------------------------------------

  const takeError = () => {
    const e = ws.getState().error;
    ws.setError(null);
    return e ?? 'That did not work.';
  };

  /** The folder a "new file" should go into, based on what is focused in the tree. */
  const dirFor = (row: Row | null): string => {
    const root = ws.getState().root?.path ?? '';
    if (row) return row.kind === 'dir' ? row.path : dirname(row.path);
    const focused = rows.find((r) => r.key === focusKey);
    if (focused) return focused.kind === 'dir' ? focused.path : dirname(focused.path);
    return activeTab ? dirname(activeTab.file) : root;
  };

  const promptNewFile = (dir: string) =>
    setPrompt({
      title: 'New file',
      hint: `In folder “${basename(dir)}”`,
      label: 'File name',
      initial: '',
      confirm: 'Create',
      validate: validateName,
      onSubmit: async (name) => ((await ws.createFile(dir, name)) ? null : takeError())
    });

  const promptNewFolder = (dir: string) =>
    setPrompt({
      title: 'New folder',
      hint: `In folder “${basename(dir)}”`,
      label: 'Folder name',
      initial: '',
      confirm: 'Create',
      validate: validateName,
      onSubmit: async (name) => {
        const created = await ws.createFolder(dir, name);
        if (!created) return takeError();
        setFocusKey(created);
        return null;
      }
    });

  const promptRename = (row: Row) =>
    setPrompt({
      title: row.kind === 'dir' ? 'Rename folder' : 'Rename file',
      label: 'New name',
      initial: row.label,
      confirm: 'Rename',
      selectBase: row.kind === 'file',
      validate: validateName,
      onSubmit: async (name) => ((await ws.renameNode(row.path, name)) ? null : takeError())
    });

  const promptNewChapter = (file: string, after: number) =>
    setPrompt({
      title: 'New chapter',
      hint: `After “${s.docs.get(file)?.chapters[after]?.title || 'the preamble'}” in ${basename(file)}`,
      label: 'Chapter title',
      initial: '',
      confirm: 'Add',
      validate: () => null,
      onSubmit: async (title) => {
        if (!(await ws.newChapter(file, after, title))) return takeError();
        const opened = ws.tabForFile(file);
        if (opened) setFocusKey(chapterKey(file, opened.chapter));
        return null;
      }
    });

  /** Moves a chapter and keeps the tree focus on it. */
  const moveRow = async (row: Row, delta: -1 | 1) => {
    const idx = await ws.moveChapter(row.path, row.chapter!, delta);
    if (idx !== null) setFocusKey(chapterKey(row.path, idx));
  };

  /** Marks a file for export and opens its Book Details so the title and author can be filled in. */
  const markAndEdit = async (file: string) => {
    if (await ws.setMarked(file, true)) setBookFile(file);
  };

  const deleteRow = (row: Row) => {
    if (row.kind === 'chapter') void ws.deleteChapter(row.path, row.chapter!);
    else void ws.deleteNode(row.path, row.kind === 'dir' ? 'folder' : 'file');
  };

  const activateRow = async (row: Row) => {
    setFocusKey(row.key);
    if (row.kind === 'chapter') return ws.openChapter(row.path, row.chapter!);
    if (row.kind === 'dir') return row.expandable ? ws.toggleExpanded(row.path, false) : undefined;
    // A file row: open it if it has no tab, switch to its tab if it isn't the active one, and only
    // collapse/expand when you click the file you are already on.
    const tab = ws.tabForFile(row.path);
    const isExpanded = () => ws.getState().expanded.has(row.path);
    if (!tab) {
      if (!isExpanded()) await ws.toggleExpanded(row.path, true);
      return ws.openChapter(row.path, 0);
    }
    if (ws.getState().activeId !== tab.id) {
      ws.activateTab(tab.id);
      if (!isExpanded()) await ws.toggleExpanded(row.path, true);
      return;
    }
    await ws.toggleExpanded(row.path, true);
  };

  const menuItems = (row: Row): MenuItem[] => {
    const reveal = { label: 'Show in File Explorer', onClick: () => ws.reveal(row.path) };
    if (row.kind === 'dir') {
      return [
        { label: 'New File Here…', onClick: () => promptNewFile(row.path) },
        { label: 'New Folder Here…', onClick: () => promptNewFolder(row.path) },
        { label: 'Rename…', hint: 'F2', onClick: () => promptRename(row) },
        reveal,
        { label: 'Delete Folder…', danger: true, hint: 'Del', onClick: () => deleteRow(row) }
      ];
    }
    if (row.kind === 'file') {
      const exportItems: MenuItem[] = row.exportBlocked
        ? [{ label: 'Can’t mark: another file with this name owns the export settings', disabled: true, onClick: () => undefined }]
        : row.marked
          ? [
              { label: 'Book Details…', onClick: () => setBookFile(row.path) },
              { label: 'Unmark for Export', onClick: () => void ws.setMarked(row.path, false) }
            ]
          : [{ label: 'Mark for Export', onClick: () => void markAndEdit(row.path) }];
      return [
        ...exportItems,
        { label: 'Rename…', hint: 'F2', onClick: () => promptRename(row) },
        reveal,
        { label: 'Delete…', danger: true, hint: 'Del', onClick: () => deleteRow(row) }
      ];
    }
    const doc = s.docs.get(row.path);
    const i = row.chapter!;
    const first = doc?.chapters[0]?.isPreamble ? 1 : 0;
    const real = !doc?.chapters[i]?.isPreamble;
    return [
      { label: 'New Chapter Below…', onClick: () => promptNewChapter(row.path, i) },
      { label: 'Move Up', hint: 'Alt+↑', disabled: !real || i <= first, onClick: () => void moveRow(row, -1) },
      {
        label: 'Move Down',
        hint: 'Alt+↓',
        disabled: !real || !doc || i >= doc.chapters.length - 1,
        onClick: () => void moveRow(row, 1)
      },
      { label: 'Delete Chapter…', danger: true, hint: 'Del', onClick: () => deleteRow(row) }
    ];
  };

  // Shortcuts and the native menu share the same actions. The ref keeps listeners stable.
  const actions: Record<MenuAction | 'toggle-mode' | 'focus-filter', () => void> = {
    save: () => void ws.save(),
    'change-folder': () => void ws.openFolder(),
    refresh: () => void ws.refresh(),
    'new-file': () => s.root && promptNewFile(dirFor(null)),
    'new-folder': () => s.root && promptNewFolder(dirFor(null)),
    'close-tab': () => s.activeId && void ws.closeTab(s.activeId),
    'next-tab': () => ws.cycleTab(1),
    'prev-tab': () => ws.cycleTab(-1),
    'next-chapter': () => void ws.gotoChapter(1),
    'prev-chapter': () => void ws.gotoChapter(-1),
    'toggle-mode': () => activeTab && ws.setMode(activeTab.id, activeTab.mode === 'visual' ? 'source' : 'visual'),
    'focus-filter': () => filterRef.current?.focus()
  };
  const act = useRef(actions);
  act.current = actions;

  useEffect(() => window.mdedit.onMenuAction((a) => act.current[a]()), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      let name: keyof typeof actions | null = null;
      if (mod && !e.shiftKey && k === 's') name = 'save';
      else if (mod && k === 'o') name = 'change-folder';
      else if (mod && e.shiftKey && k === 'n') name = 'new-folder';
      else if (mod && k === 'n') name = 'new-file';
      else if (mod && k === 'w') name = 'close-tab';
      else if (mod && k === 'p') name = 'focus-filter';
      else if (mod && e.shiftKey && k === 'm') name = 'toggle-mode';
      else if (e.ctrlKey && e.key === 'Tab') name = e.shiftKey ? 'prev-tab' : 'next-tab';
      else if (e.ctrlKey && e.key === 'PageDown') name = 'next-chapter';
      else if (e.ctrlKey && e.key === 'PageUp') name = 'prev-chapter';
      else if (e.key === 'F5') name = 'refresh';
      if (!name) return;
      e.preventDefault();
      act.current[name]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- sidebar resize --------------------------------------------------------------------

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const move = (ev: PointerEvent) => ws.setSidebarWidth(ev.clientX, false);
      const up = (ev: PointerEvent) => {
        ws.setSidebarWidth(ev.clientX, true);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        document.body.classList.remove('resizing');
      };
      document.body.classList.add('resizing');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [ws]
  );

  // ---- render ----------------------------------------------------------------------------

  const toolbarBusy = s.refreshing;

  return (
    <div className="app" style={{ gridTemplateColumns: `${s.sidebarWidth}px 6px minmax(0, 1fr)` }}>
      <aside className="sidebar">
        <div className="toolbar">
          <button onClick={() => void ws.openFolder()} title="Choose a different folder (Ctrl+O)">
            {s.root ? 'Change Folder…' : 'Open Folder…'}
          </button>
          <button
            onClick={() => void ws.refresh()}
            disabled={!s.root || toolbarBusy}
            title="Rescan the folder for new, renamed and deleted files (F5)"
          >
            {toolbarBusy ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <button onClick={() => promptNewFile(dirFor(null))} disabled={!s.root} title="New file (Ctrl+N)" aria-label="New file">
            ＋ File
          </button>
          <button
            onClick={() => promptNewFolder(dirFor(null))}
            disabled={!s.root}
            title="New folder (Ctrl+Shift+N)"
            aria-label="New folder"
          >
            ＋ Folder
          </button>
        </div>
        {s.root ? (
          <>
            <div className="root-name" title={s.root.path}>
              {s.root.name}
            </div>
            <input
              ref={filterRef}
              className="filter"
              type="search"
              placeholder="Filter files (Ctrl+P)"
              aria-label="Filter files"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setFilter('');
                else if (e.key === 'ArrowDown' && rows[0]) {
                  e.preventDefault();
                  setFocusKey(rows[0].key);
                  (e.currentTarget.parentElement?.querySelector('[role=treeitem]') as HTMLElement | null)?.focus();
                }
              }}
            />
            {s.root.children.length === 0 ? (
              <p className="muted pad">This folder is empty. Use “＋ File” or “＋ Folder” to add something.</p>
            ) : rows.length === 0 ? (
              <p className="muted pad">No files match “{filter}”.</p>
            ) : (
              <Tree
                rows={rows}
                focusKey={focusKey}
                activeKey={activeKey}
                dirtyFiles={dirtyFiles}
                onFocusKey={setFocusKey}
                onActivate={(r) => void activateRow(r)}
                onToggle={(r) => void ws.toggleExpanded(r.path, r.kind === 'file')}
                onContextMenu={(row, x, y) => setMenu({ row, x, y })}
                onRename={promptRename}
                onDelete={deleteRow}
                onMoveChapter={(r, d) => void moveRow(r, d)}
              />
            )}
          </>
        ) : (
          <p className="muted pad">Pick a folder to browse its Markdown files.</p>
        )}
      </aside>

      <div
        className="splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={s.sidebarWidth}
        tabIndex={0}
        onPointerDown={startDrag}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            ws.setSidebarWidth(s.sidebarWidth + (e.key === 'ArrowLeft' ? -16 : 16), true);
          }
        }}
      />

      <main className="content">
        {s.error && (
          <div className="banner error" role="alert">
            {s.error} <button onClick={() => ws.setError(null)}>Dismiss</button>
          </div>
        )}
        {orphan && (
          <div className="banner warn" role="alert">
            Export settings for “{basename(orphan).replace(/\.export\.json$/i, '')}” no longer match a file (renamed outside MDEdit?).{' '}
            <button onClick={() => setRelink(orphan)}>Link to a file…</button>{' '}
            <button onClick={() => setIgnoredOrphans(new Set([...ignoredOrphans, orphan]))}>Ignore</button>
          </div>
        )}
        {s.notice && (
          <div className="banner info" role="status">
            {s.notice} <button onClick={() => ws.dismissNotice()}>Dismiss</button>
          </div>
        )}

        <Tabs tabs={s.tabs} activeId={s.activeId} onActivate={(id) => ws.activateTab(id)} onClose={(id) => void ws.closeTab(id)} />

        <div className="panes">
          {s.tabs.length === 0 && (
            <p className="muted pad">{s.root ? 'Select a chapter to edit it.' : 'Open a folder to get started.'}</p>
          )}
          {s.tabs.map((tab) => {
            const doc = s.docs.get(tab.file);
            const chapter = doc?.chapters[tab.chapter];
            if (!doc || !chapter) return null;
            const active = tab.id === s.activeId;
            const dirty = tab.draft !== null;
            return (
              <section key={tab.id} className="pane" hidden={!active} aria-label={basename(tab.file)}>
                {tab.conflict?.kind === 'changed' && (
                  <div className="banner warn" role="alert">
                    {basename(tab.file)} was changed on disk while you have unsaved edits.{' '}
                    <button onClick={() => ws.resolveConflict(tab.id, 'reload')}>Reload from disk (discard my edits)</button>{' '}
                    <button onClick={() => ws.resolveConflict(tab.id, 'keep')}>Keep my version</button>
                  </div>
                )}
                {tab.conflict?.kind === 'missing' && (
                  <div className="banner warn" role="alert">
                    {basename(tab.file)} was deleted or moved. Saving will recreate it.{' '}
                    <button onClick={() => ws.resolveConflict(tab.id, 'dismiss')}>Dismiss</button>
                  </div>
                )}
                <div className="editor-head">
                  <h2>
                    {chapterLabel(chapter)}
                    {dirty && <span className="dirty" title="Unsaved changes"> ●</span>}
                  </h2>
                  <div className="head-actions">
                    <button aria-label="Previous chapter" title="Previous chapter (Ctrl+PgUp)" disabled={tab.chapter === 0} onClick={() => void ws.gotoChapter(-1)}>
                      ‹
                    </button>
                    <button aria-label="Next chapter" title="Next chapter (Ctrl+PgDn)" disabled={tab.chapter >= doc.chapters.length - 1} onClick={() => void ws.gotoChapter(1)}>
                      ›
                    </button>
                    <button
                      onClick={() => ws.setMode(tab.id, tab.mode === 'visual' ? 'source' : 'visual')}
                      title="Switch between formatted and raw Markdown (Ctrl+Shift+M)"
                    >
                      {tab.mode === 'visual' ? 'Source' : 'Visual'}
                    </button>
                    <button onClick={() => void ws.save(tab.id)} disabled={!dirty}>
                      Save (Ctrl+S)
                    </button>
                  </div>
                </div>
                {tab.mode === 'visual' ? (
                  <Editor
                    key={`${tab.id}@${tab.reloadKey}@v`}
                    initial={chapter.raw}
                    restore={tab.draft}
                    onChange={(md) => ws.setDraft(tab.id, md)}
                    saved={tab.saved}
                  />
                ) : (
                  <SourceEditor
                    key={`${tab.id}@${tab.reloadKey}@s`}
                    raw={chapter.raw}
                    draft={tab.draft}
                    onChange={(md) => ws.setDraft(tab.id, md)}
                    savedVersion={tab.saved?.version ?? 0}
                  />
                )}
              </section>
            );
          })}
        </div>

        {activeTab && activeDoc && activeChapter && (
          <StatusBar
            chapterIndex={activeTab.chapter}
            chapterCount={activeDoc.chapters.length}
            words={countWords(activeTab.draft ?? activeChapter.raw)}
            dirty={activeTab.draft !== null}
            autosaved={activeTab.autosavedAt !== null}
            eol={activeDoc.eol}
            mode={activeTab.mode}
          />
        )}
      </main>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.row)} onClose={() => setMenu(null)} />}
      {prompt && <PromptDialog spec={prompt} onClose={() => setPrompt(null)} />}
      {relink && (
        <RelinkDialog sidecar={relink} candidates={relinkCandidates} onLink={(md) => ws.relinkSidecar(relink, md)} onClose={() => setRelink(null)} />
      )}
      {bookFile && <BookDetailsDialog file={bookFile} onClose={() => setBookFile(null)} onSaved={() => void ws.refresh()} />}
    </div>
  );
}
