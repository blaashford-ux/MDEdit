# Changelog

### Unreleased
**Fixed**
- **Updating MDEdit from About on Windows is safer.** The installer is now saved under a temporary name and only given its real name once it is complete and checked, so a half-written or damaged file can never be started. The check reads the saved file back from disk (not just the data as it arrived), confirms every byte arrived, and compares it with the release's checksums; a mismatch says what went wrong. Asking twice no longer downloads the same file twice, and old installers are cleared out of the temporary folder. This targets the Windows "Installer integrity check has failed" message some people got when updating from the app although the same installer downloaded from the release page worked.

### 0.6.1 — 2026-10-08
**New**
- **Click a note to go to it.** In the Notes panel, clicking a note now scrolls to its text and highlights it, opening the chapter it is in if that is a different one. If the chapter you are leaving has unsaved changes you get the usual Save / Don't Save / Cancel question first (Cancel keeps you where you are). A note whose text has been deleted from the file says so instead of doing nothing.

### 0.6.0 — 2026-10-08
**New**
- **Review with AI.** Claude, GPT and other AI apps can read your chapters and leave comments and suggestions in the Notes panel, signed with the AI's name. They can't change your text. Notes carry an **AI** badge and a topic label; when more than one person or AI has written notes you can filter by who and by topic, and with one reviewer chosen **Accept all N suggestions** applies theirs after a confirmation. Notes written outside the app appear within a few seconds, with no restart.
- **Notes → AI…** connects an AI app. **Save files to Downloads** writes a **MDEdit AI Kit** folder: a Claude Desktop extension (`mdedit.mcpb`), the editing skills as upload-ready zips and folders, the server with ready-made settings for Claude Code and Codex, instructions to paste into GPT apps, and a README. The dialog also lists each AI reviewer's notes, with **Delete all…** for one reviewer. In the installed app the connection runs on MDEdit itself, so Node.js isn't needed.
- **Three editing skills,** not tied to a genre: **Developmental edit** (comments on structure, pacing, stakes, continuity), **Line edit** (suggestions for sentences, comments on patterns and strengths) and **Copy edit** (exact corrections, grouped by pattern, with a running style sheet). They follow the author's style sheet and notes. Notes are signed "Claude · Line edit", or just "Claude" with no skill. The same instructions are offered as MCP prompts for clients without skills.
- **The connection** (an MCP server) can read chapters one at a time as plain text, search the whole book for a name or term, and add, reply to, and withdraw its own notes. A note whose quote can't be found, or matches several places, is rejected with the reason so the AI can correct it.
- **Online apps (advanced, off by default).** For apps that can't run a program on your PC (the ChatGPT app, Custom GPTs): **Notes → AI… → Online apps** listens on this PC only and answers only requests carrying a long random token, as MCP over HTTP and as a REST API with an OpenAPI description for a Custom GPT's Actions. Making it reachable from the internet is up to you (for example a tunnel); the dialog explains the risk. The token can be replaced at any time.

**Changed**
- Saving a reviewer's notes now merges with what is already on disk, so accepting or rejecting a note can no longer erase notes added in the meantime by an AI or the other side of a share.

**Fixed**
- Note cards in the Notes panel could be laid out sideways, because the export-settings list used the same style name.

### 0.5.0 — 2026-10-07
**New**
- **Comments and suggestions.** Select text, or right-click it (press and hold on the phone), and choose **Add comment…** or **Suggest a change…**; with nothing selected the note attaches to the paragraph. The **Notes** button on each chapter opens a panel to reply, resolve, reject, accept (a suggestion edits the chapter) and delete. Notes are highlighted in the text and follow it as you edit; a note whose text was deleted stays in the list, marked *not in this chapter*. They are stored one file per reviewer under `.mdedit/review`.
- **Share a project for review.** Notes → **Share…** makes one link per reviewer. Reviewers open it under **Projects → Shared with me → Open invitation…**, Google's file picker gives MDEdit access to just two files, and the project opens read-only. They can read and leave notes; they can't change your text or see each other's notes. You see everyone's notes together, each labelled with who wrote it. Your text is re-uploaded automatically after you save, so reviewers always see your latest version; their notes reach you within about a minute. Removing a reviewer closes their file and keeps their notes. Needs Google Drive sync on both sides. Projects shared with you never sync into your own Drive.
- **Sharing page.** **Projects → Sharing** lists every project you've shared, with its reviewers and open notes; **Manage links…** opens that project's links (copy, remove, or **Stop sharing…**), and projects not shared yet have a **Share…** button. Each link can be copied two ways: **Copy link** for the link alone, or **Copy invitation**, a short note with a link to download the latest MDEdit and what to do with the invitation. Pasting a whole invitation message into **Open invitation…** works too.
- **Phone: the find bar fits the screen.** Its options wrap onto lines instead of running off the right edge, so the Close button is always reachable; the magnifier in the top bar opens and closes it.
- **Invitation page.** A small web page (published with GitHub Pages) explains an invitation link and hosts Google's file picker inside the app.
- **Update from About.** Help → About MDEdit (the ⓘ button on the phone) has a **Check for updates** button. If the latest GitHub release is newer, **Update** downloads the file for your device (the Windows installer, or the Android app), checks it against the release's checksums, then closes MDEdit and runs the installer (Windows) or opens Android's installer. The first time on Android you are sent to allow MDEdit to install apps. Android only accepts the update if the release was signed with the same key as the installed app.

### 0.4.3 — 2026-10-07
**New**
- **Phone: Find and Replace.** A magnifier button in the top bar opens the find bar (next / previous, match case, whole word, regular expressions, replace) for the open file.
- **Phone: press-and-hold menus.** Holding a file, folder or project opens MDEdit's own menu without the phone's system menu covering it. Holding on text in the editor opens Cut, Copy, Paste, Select all and Find.
- **Also by the author: a blurb for each book**, printed under its title and link in the EPUB, print PDF and DOCX.
- **Projects home: filter by status** (Planning, Drafting, Revising, Editing, Published, On hold), alongside search, sort and Archived.

**Changed**
- **Project switcher order:** projects you are editing come first, then Planning, Drafting and Revising, with Published and On hold last.
- **Back matter is easier to read in the print PDF and DOCX:** a blank line between paragraphs, lines and links, and the line breaks you type in the back-matter fields are kept (a blank line starts a new paragraph).

### 0.4.2 — 2026-10-07
**New**
- **Export settings follow app → project → book, field by field.** Each level stores only the fields you change; every other field follows the level above, so editing a project's (or the app's) back matter, author, fonts or layout now reaches every book that hasn't set that field itself. Previously each book kept a full copy made when it was first set up, so later changes never reached it.
- Every field in **Project Settings → Export defaults**, **Book Details** and **Export** is tagged *From app settings*, *From project settings* or *Set for this book*, with a **Reset** that hands it back. The Export dialog ends with a list of every setting that doesn't simply follow the app, with where it is set.
- **Chapter drop** (Export → Print PDF): the space above each chapter heading, from 0 (flush with the top margin) to 3 in; the default stays 1.25 in.

**Changed**
- **Project settings** replace 0.4.1's single **Override** switch with per-field overrides (templates keep the switch). A project starts from what its template changes relative to the app.
- Existing files are converted the first time they are opened: a project's saved book becomes the fields it changes, and a book's `.export.json` keeps only the fields that differ from what it would inherit (the rest now follow the project and app). The previous book file is kept beside it as `<name>.export.v1.bak` (never synced). The copyright year is fixed when a book is first set up, so it doesn't change with the calendar. Excluded chapters and the cover image stay with each book.
- A book whose settings differed from its project (for example a back matter page typed into the book earlier) keeps those as its own and shows *Set for this book*; **Reset** it to follow the project.

### 0.4.1 — 2026-10-07
**New**
- **Line numbers** in the right margin, outside the text: every row you see is numbered, wrapped rows and blank lines included, and every tenth is always visible in a faint colour. The rest appear while the pointer is over the editor, with the line under the pointer picked out. Numbers run through the whole file; the open chapter is measured exactly and the others are estimated, so numbers in other chapters can be a little off and change if you resize the window.
- **Go to Line** (Ctrl+G, Edit → Go to Line…, and a **Line…** button on the phone): jumps to a numbered row anywhere in the file, opening another chapter if needed and asking about unsaved changes first.
- **Editing stage**: while a project's status is *Editing*, every chapter in the file list has a red empty circle. Leaving a chapter you saved asks whether to mark it edited, which turns the dot into a filled green one; *Mark Edited* / *Unmark Edited* are also on the chapter's right-click menu. Marks stay with a chapter when it is moved, retitled or its file is renamed, and stay when the status changes.
- Edited marks are kept in their own file (`.mdedit/edited.json`) and **merge between devices** when syncing, chapter by chapter, so marks made on your phone and your PC both survive.
- **Project settings show every setting**: chapter-heading level and the title, front/back matter and export defaults are always visible, read-only with the app's values until you tick **Override**, which makes them editable.

**Changed**
- **Word counts and goals follow the active manuscript only.** The Projects cards, Quick Switcher, status-bar total and Progress window show “-” when no manuscript is active. Each manuscript keeps its own goal and writing history, so choosing it again brings them back. Project Settings → Goal now asks you to pick an active manuscript first, and the old “What counts” folder list is gone.
- **Ctrl+G is now Go to Line.** Find Next and Previous stay on F3 and Shift+F3 (Ctrl+G and Ctrl+Shift+G no longer do that).
- A sync, or Refresh, now also reloads the open project's edited marks, status, active manuscript and goals, so changes from another device appear without reopening the project.

**Fixed**
- **A chapter always opens at the top**, instead of keeping the scroll position of the one before it.
- **Phone: the chapter header no longer paints over the file drawer** when it is open, and the backdrop now dims it too.

### 0.4.0 — 2026-10-06
**New**
- **Android app** (an APK on each release): the editor, Projects home, goals and progress on your phone, with files stored on the phone. It has no KDP export, fonts or Explorer actions, and its Root Folder is fixed.
- **Google Drive sync** on Windows (File → Google Drive Sync…, plus a status-bar chip) and Android (cloud button): sign in once per device; MDEdit keeps your projects in an `MDEdit` folder in your Drive and can only see files it created there. Passes run a few seconds after you save, when you return to the app, and every minute or two; a status screen shows progress, the last pass and any problems.
- **Keep both versions on conflict**: a chapter changed on two devices keeps Drive's version under its name and your other version beside it as `Name (conflict - Device - date).md`. Writing history is merged day by day; project settings use the last writer. A delete beats nothing that was edited elsewhere, and a sync that would delete most of your files stops and asks first.
- **Windows-compliant names everywhere**: new and renamed files and folders follow Windows' rules on every device (no `< > : " / \ | ? *`, reserved names, trailing dots or spaces; at most 120 characters). Names that arrive from Drive in another form are renamed to match, in Drive too.
- Files deleted by another device go to the **Recycle Bin** on Windows and to the app's trash on Android.

**Notes**
- Only text files sync for now (`.md`, `.txt`, `.json`, `.csv`, `.html`, `.css`, `.xml`, `.yml`); images and other binaries, and each project's `Exports` folder, are left alone.
- Sync covers the Root Folder. Don't put it inside OneDrive, Dropbox or Google Drive for Desktop, or two syncs will fight over it.
- Sync is much faster than the first builds: transfers run in parallel, scans use the file listing instead of a lookup per file, and the Projects screen caches word counts.

**Changed**
- The Windows installer is built with the Google sign-in configured. The Android app is signed with your own key.

### 0.3.0 — 2026-10-05
**New**
- **Projects**: a project is a folder (with subfolders) marked by a small hidden `.mdedit` folder. MDEdit works out of a **Root Folder** (default `%USERPROFILE%\MDEdit`; chosen on first run, changeable in Settings, with an offer to move your projects). A welcome screen sets this up the first time, and offers the folder you last used as a project.
- **Projects home** with a card per project (status, word count, goal progress, last edited), search, sort, archive, and a context menu to open, rename, duplicate, change status or delete (to the Recycle Bin, after typing the name).
- **New Project** dialog (Ctrl+Alt+N): name + template with a live preview of the folders it will create. Built-in templates: Novel, Series, Short story, Blank.
- **Project templates** (Settings → Projects): edit the folder tree, which folders count toward word goals, starter files and the export defaults each template carries.
- **Project switcher** in the sidebar and **Ctrl+K quick switcher**; File → Open Folder still opens any folder, and other folders in the Root can be converted to projects.
- **Per-project overrides**: chapter-heading level and export defaults can be set per project; the template's values are copied in when the project is made.
- **Project status** (Planning, Drafting, Revising, Editing, Published, On hold) and notes.
- **Word-count goals and progress**: target and optional deadline; Progress window with a day-by-day bar chart, burn-down against a steady-pace line, words per day needed, and estimated completion at the 3-day and 5-day averages; running total in the status bar.
- **Series template**: a Manuscripts folder for several books (no book files created) plus a series bible.
- **Editing stage**: while a project's status is *Editing*, every chapter in the file list has a red empty circle; leaving a chapter you saved asks whether to mark it edited (filled green). *Mark Edited* / *Unmark Edited* are on the chapter's right-click menu. The marks live in their own `.mdedit/edited.json` (by file and chapter title, so they follow moved, retitled and renamed chapters), stay when the status changes, and merge between devices when syncing.
- **Active Manuscript**: right-click a file → *Active Manuscript* to make word-count goals and progress follow that single file (one at a time; choosing another swaps without asking). Project word counts and goals exist only for the active manuscript: with none chosen the cards, status bar and Progress window show “-”, and a manuscript's stats are kept and come back when it is chosen again. A target marker shows on the file in the browser, the Progress chart and tiles are labelled with its filename, and each manuscript keeps its own goal and writing history.

**Changed**
- The sidebar's folder button became the project switcher; File → Change Folder is now **Open Folder**.


### 0.2.0 — 2026-10-05
**New**
- **Find & Replace** (Ctrl+F / Ctrl+H, F3 / Shift+F3, Edit menu): highlights in the formatted editor, works in Source mode, match case / whole word / regular expressions (`$1`, `$&` in replacements); search this chapter or the whole file (Replace All in the file asks first).
- **Undo Last Action** (Ctrl+Alt+Z, redo Ctrl+Alt+Y, Edit menu, status-bar button): reverses the last 5 delete / move / add-chapter actions and whole-file Replace All.
- **Settings** (File → Settings, Ctrl+,): choose which heading level starts a chapter (H1–H6), set the template new books start from (author, copyright page, dedication, epigraph, back matter) and the default export choices.
- **Fonts for export**: EB Garamond, Crimson Pro and Libre Baskerville (all open-licence) ship with the app and are embedded in EPUB and PDF; any font installed on your computer can be used for the print PDF.
- **Scene-break navigation**: Ctrl+↑ / Ctrl+↓ or the ↑ Scene / ↓ Scene buttons jump between scene breaks, in Visual and Source mode.
- **New look**: borderless, tonal, rounded design with a palette drawn from the app icon, in light and dark, with line icons.
- **Custom title bar**: frameless window with in-window File / Edit / Go / View / Help menus (mouse, arrows, Alt+letter), the open chapter and file, and window buttons (drawn by the OS on Windows).
- The chapter heading and toolbar stay pinned while you scroll.
- The copyright page has an optional **Content Warning** notice (default text “Add Content Warnings here”).

**Changed**
- Export files (`<name>.export.json`) use the field names `contentWarning` / `contentWarningText`; older files are tidied automatically the first time they are read.
- Exports record the chosen fonts; a missing font falls back to EB Garamond with a warning.
- Clicking Undo / Cut / Copy / Paste in the menu now acts on the editor (the menu no longer takes focus).

**Release pipeline**
- Pushing a version tag, or running the *release* workflow from the Actions tab, builds, tests and publishes the Windows installer with checksums (see `docs/RELEASING.md`).

### 0.1.0 — 2026-10-05
- First release: folder browser with expandable folders and empty folders, chapter-at-a-time WYSIWYG editing (Milkdown), Save / Don't Save / Cancel prompts, external-change detection, tabs, session restore, crash-recovery drafts, dark mode, Source mode, file and chapter management.
- **Export for KDP**: mark a file for export, fill in Book Details (title page, copyright page, dedication, epigraph, back matter), export to EPUB 3, KDP print-interior PDF (trim sizes from 5 × 8, automatic gutter) and DOCX.
- Windows installer with app icon, single instance and `.md` file association.
