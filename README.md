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
- [ ] WYSIWYG editor, save prompts, file watcher, remember last folder
