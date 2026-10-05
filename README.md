# MDEdit

Windows desktop Markdown editor: pick a folder, browse its `.md` files, and edit them one chapter (Heading 1) at a time.

## Develop
```
npm install
npm test          # chapter engine tests
npm run dev       # Electron + Vite
npm run dist      # Windows installer (run on Windows / CI)
```

## Status
- [x] Scaffold (Electron, Vite, React, TypeScript, Vitest, CI Windows build)
- [x] Chapter engine (`src/shared/chapters.ts`): lossless split/join by H1
- [x] Folder picker, recursive file tree, chapters listed under each file (read-only preview)
- [x] WYSIWYG chapter editor (Milkdown Crepe), dirty tracking, Ctrl+S atomic save
- [x] Save / Don't Save / Cancel on chapter/file/folder switch and on window close
- [x] External-change detection (auto-reload when clean, conflict banner when dirty, overwrite check on save)
- [x] Reopens the last folder on startup
- [x] Change Folder and Refresh (buttons, F5, menu); custom menu without Reload
- [x] Tabs: one per open file, swapping never prompts, closing a tab with unsaved edits does
- [x] Remembers folder, open tabs, expanded folders, sidebar width, window size/position and theme
- [x] Window title and status bar (chapter n of m, word count, saved state, line endings)
- [x] Dark mode (follows Windows; View > Theme to override)
- [x] Chapter navigation (Ctrl+PgUp/PgDn), word counts in the tree, Source/Visual toggle per tab
- [x] Tree: arrow-key navigation, file filter (Ctrl+P), resizable sidebar
- [x] New file, rename, delete (Recycle Bin), show in Explorer; new/move/delete chapter from the sidebar
- [x] Autosaved drafts: unsaved edits survive a crash and are offered back on next start
- [ ] Packaging: app icon, single-instance, open-with, code signing

## Shortcuts
| Key | Action |
|---|---|
| Ctrl+S | Save |
| Ctrl+O / Ctrl+N | Change folder / New file |
| Ctrl+W | Close tab |
| Ctrl+Tab, Ctrl+Shift+Tab | Next / previous tab |
| Ctrl+PgDn, Ctrl+PgUp | Next / previous chapter |
| Ctrl+Shift+M | Toggle Source / Visual |
| Ctrl+P | Filter files |
| F5 | Refresh |
| F2 / Del / Alt+Up / Alt+Down | Rename / delete / move chapter (in the tree) |
