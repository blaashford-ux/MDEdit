# Milestone 8 — Projects

Status: **plan, not started.** Open questions are at the end; the build order assumes the recommended answers.

## 1. The idea

Today the app opens "a folder". From 0.3 it works out of a **Root Folder** that contains **Projects**. A project is still
an ordinary folder with subfolders and Markdown files (nothing is locked in; Explorer, git and sync keep working), but the
app treats it as a first-class thing: it is created from a **template**, listed on a Projects home screen, switched between
quickly, and carries a little metadata.

```
C:\Users\you\MDEdit\                 ← Root Folder (default; chosen at first run, changeable in Settings)
├── The Lost King\                   ← Project   (has .mdedit\project.json)
│   ├── Manuscript\
│   ├── Characters\
│   ├── Worldbuilding\
│   ├── Research\
│   └── Exports\
└── Short Stories\                   ← Project
```

## 2. Data model

| Thing | Where | Contents |
|---|---|---|
| Root folder, templates, default template, last project | app `settings.json` | `rootFolder`, `templates[]`, `defaultTemplateId`, `lastProject` |
| Project marker | `<project>\.mdedit\project.json` | `version`, `id`, `name`, `templateId` + template name, `createdAt`, optional `status`, `notes` |
| Template | in settings | `id`, `name`, `description`, `folders[]` (nested tree of names), optional `files[]` (starter Markdown) |

* **Recognising a project:** a direct child of the Root that contains `.mdedit\project.json`. Other child folders are shown
  under "Not projects" with a one-click **Convert to project** (creates the marker, changes nothing else).
* The `.mdedit` folder is hidden from the file tree. The existing `<name>.export.json` sidecars stay beside their manuscripts.
* Everything is plain JSON, written atomically, sanitised on read (same approach as Book Details), and tidied on first read.
* Built-in templates: **Novel** (Manuscript, Characters, Worldbuilding, Research, Exports), **Series Book** (Book 1…, Series Bible),
  **Short Story** (Drafts, Notes, Exports), **Blank** (no subfolders). Editable; "Reset to defaults" restores them.

## 3. What the user sees

1. **First run** (and upgraders): a welcome dialog — choose the Root Folder (default shown, Browse…, "Create it for me"),
   optionally create a first project, then done. Upgraders from 0.2 are offered to adopt their last folder as a project
   (see question 2).
2. **Projects home** (the sidebar when no project is open; also reachable any time): rows or cards with name, template,
   word count, last edited, status chip; search, sort (recent / name), **New Project** primary button, empty state that
   shows the templates. Right-click: Open, Rename, Duplicate, Show in Explorer, Archive, Delete.
3. **Inside a project:** the sidebar header is a **project switcher** (name + ▾ → recent projects, "All projects…",
   "New project…"); the title bar shows `Root › Project`. The existing tree, tabs, chapters, export and find all work
   unchanged inside the project. **Ctrl+K** opens a quick switcher (type to filter projects, Enter to open).
4. **New Project modal** (File → New Project…, home button, switcher): Name (live validation), Template (dropdown with a
   live preview of the folders it will make), live path preview ("Creates C:\Users\you\MDEdit\The Lost King"), Create /
   Cancel. Collisions ("a project with that name exists") and Windows name rules are explained inline. On success the
   project opens with its first useful thing selected.
5. **Settings → Projects:** Root Folder (path, Change…, Open in Explorer, what-happens-to-existing-projects notice);
   **Project Templates** editor — list on the left (add, duplicate, delete, set default, reset), on the right the name,
   description, and a **folder tree editor** (add child, rename, drag or ↑/↓ to reorder, remove) with a live preview and
   inline name validation; optional starter files. Also "reopen last project at launch".
6. **Project properties** (right-click → Properties): name, template, created, size, word count, status, notes;
   "Add missing template folders" and "Save this structure as a template".

## 4. Behaviour rules that matter

* Creating a project is all-or-nothing: made in a temp name and renamed, or rolled back on error; never half a project.
* Rename renames the folder and the marker together; open tabs, session and drafts follow (the workspace already remaps paths).
* Delete goes to the Recycle Bin after a **type the project name** confirmation; unsaved edits are resolved first.
* Switching projects uses the existing Save / Don't Save / Cancel flow; each project keeps its own tabs and session.
* Root missing or unreachable (renamed, external drive, sync client): a banner on the home screen with **Choose Root…** /
  **Retry**; nothing is deleted or recreated silently.
* Changing the Root only repoints the app; **no files are moved** unless the user asks ("Move my projects there").
* Folders added or removed in Explorer appear on focus / Refresh (F5); the home list refreshes when the window regains focus.
* Windows realities handled: illegal characters, reserved names (CON, NUL…), trailing dots/spaces, case-insensitive
  clashes, long paths, OneDrive/Dropbox roots (a gentle note, not a block), read-only roots.

## 5. Code plan

Pure, unit-tested (`src/shared`): `projectTemplates.ts` (model, defaults, sanitize, validate names/tree, preview),
`projectName.ts` (Windows-safe names, collision keys), `projectMeta.ts` (marker format, migrations).
Main (`electron`): `projects.ts` (list/scan root, create from template with rollback, rename, duplicate, delete, convert,
stats), settings additions, IPC, scan change to hide `.mdedit`, root-missing detection.
Renderer: `Workspace` gains a `project` (the folder it already opens stays the workspace root), `ProjectsHome`,
`NewProjectDialog`, `ProjectSwitcher` + `QuickSwitcher`, `TemplateEditor` (Settings tab), `WelcomeDialog`,
breadcrumb in the title bar, menu items.

## 6. Build order (each step tested before the next)

* **8a** Data model + main-process project operations + migrations, with temp-folder tests (create/rollback/rename/delete/convert, name rules, template sanitising).
* **8b** Settings: Root Folder and the Template editor (live preview, validation, defaults, reset).
* **8c** New Project modal, Projects home, switcher, quick switcher, breadcrumb, menu/shortcuts; Workspace project awareness.
* **8d** First run and 0.2 migration; root-missing handling; focus refresh.
* **8e** Polish: properties, status, word counts, archive, save-as-template, docs, changelog, e2e suite, **0.3.0** release.

## 7. Tests

Unit: names and collisions, template tree validation, marker round-trip, scan classification, create with forced failure
at each step (rollback leaves nothing), rename/delete/convert on temp dirs, settings migration. Workspace tests: project
switch with dirty tabs (save / discard / cancel), rename remap, delete cleanup. E2E (real app): first run, create from
each template, edit and use a custom template, switch with unsaved edits, rename, delete (typed confirm), root change,
root missing banner, upgrade path.

## 8. Open questions

See the list in the conversation; answers are recorded here once decided.
