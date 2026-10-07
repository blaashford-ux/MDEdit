# MDEdit

A Markdown editor for writing books, on **Windows and Android**. Keep each book in a **project**, edit it one chapter at a time, and export a finished **EPUB, print PDF and Word file** ready for Kindle Direct Publishing. Both apps keep your projects in step through **Google Drive**.

**Download:** the latest Windows installer and Android app are on the [Releases page](https://github.com/blaashford-ux/MDEdit/releases/latest). See what's new in the [changelog](CHANGELOG.md).

> The Windows installer isn't code-signed yet, so Windows SmartScreen may say "unknown publisher" the first time you run it. Choose **More info → Run anyway**.

## Writing
- **Projects.** A project is a folder with the subfolders you choose, kept in your **Root Folder**. The Projects home shows each project as a card with its status, word count and goal progress. Start one with **New Project** (Ctrl+Alt+N) from a template (Novel, Series, Short story, Blank), switch with Ctrl+K, and search, sort, filter by status, archive or duplicate from the home page.
- **Chapters.** Files open one chapter at a time (Heading 1 by default; choose the level in Settings). Edit in the formatted view or switch to raw Markdown (Ctrl+Shift+M), jump between scene breaks, and go to any line.
- **Find and Replace.** Search a chapter or the whole file, with match case, whole word and regular expressions.
- **Goals and progress.** Set a word-count goal and deadline for your active manuscript and follow a day-by-day chart, words per day needed, and an estimated finish date.
- **Editing stage.** When a project's status is *Editing*, mark each chapter as edited and watch your progress through the book.
- **Safe by default.** Autosaved drafts survive a crash, outside changes to a file are detected, and undo covers deleting, moving and adding chapters. Deleted files go to the Recycle Bin.
- **Dark mode**, tabs, word counts, and your open tabs and window position are remembered.

## On your phone
The Android app has the same editor, Projects home, goals and progress, with find and replace, and your files stay on the phone. Press and hold a file or project for its menu, or press and hold text for Cut, Copy, Paste and Select all. It has no KDP export.

## Google Drive sync
Sign in once on each device and MDEdit keeps your projects in an `MDEdit` folder in your Google Drive. It can only see files it created there. Edits sync a few seconds after you save and when you return to the app. If two devices change the same chapter, **both versions are kept**, and nothing is deleted in bulk without asking. Don't put your Root Folder inside OneDrive, Dropbox or Google Drive for Desktop.

## Review with others
Select text (or right-click it; press and hold on the phone) and choose **Add comment…** or **Suggest a change…**. The **Notes** panel lists them, and accepting a suggestion edits your chapter. To get feedback from other people, open Notes → **Share…** and create a link for each reviewer. They open it under **Projects → Shared with me** in their own MDEdit, read your latest text and add their own notes; you see everyone's together, and they never see each other's. **Projects → Sharing** lists everything you've shared and lets you manage each project's links; copy a link on its own or a short invitation with a download link for MDEdit. Sharing uses Google Drive and needs sync set up on both sides.

## Export for KDP
1. Right-click a `.md` file and choose **Mark for Export**. Your manuscript is never modified; the book's details are saved beside it.
2. Fill in **Book Details**: title, subtitle and author; the copyright page; dedication; epigraph; and back matter (Continue the Story, Also by the author with a blurb for each book, About the Author, and a custom page). Only links you type are ever added.
3. Choose **Export…** (Ctrl+E), check the title and author, pick your outputs and export.

| Output | What you get |
|---|---|
| EPUB 3 | Passes the standard EPUB checker, with embedded fonts |
| Print PDF | Exact KDP trim size (5 × 8 up to 8.5 × 11 in), mirrored margins with the right inside margin for your page count, chapters starting on right-hand pages, page numbers and a contents page |
| DOCX | A clean Word file with a linked contents list, ready for import |

Fonts: EB Garamond, Crimson Pro and Libre Baskerville come with the app, or use any font installed on your computer for the print PDF.

**Settings layer.** App settings, project settings and each book's own settings are applied in that order. A book changes only the fields you edit, so updating a project default reaches every book that hasn't set that field. Each field says where its value comes from, and **Reset** hands it back.

Not included: the paperback cover PDF, ISBN barcodes and uploading to KDP.

## Shortcuts
| Key | Action |
|---|---|
| Ctrl+S | Save |
| Ctrl+Alt+N / Ctrl+K | New project / Switch project |
| Ctrl+O / Ctrl+N / Ctrl+Shift+N | Open a folder / New file / New folder |
| Ctrl+W | Close tab |
| Ctrl+Tab, Ctrl+Shift+Tab | Next / previous tab |
| Ctrl+PgDn, Ctrl+PgUp | Next / previous chapter |
| Ctrl+↓, Ctrl+↑ | Next / previous scene break |
| Ctrl+, | Settings |
| Ctrl+Shift+M | Toggle Source / Visual |
| Ctrl+Alt+Z / Ctrl+Alt+Y | Undo / redo the last chapter or file action (5 deep) |
| Ctrl+P | Filter files |
| Ctrl+F / Ctrl+H | Find / Find & Replace |
| F3, Shift+F3 | Next / previous match |
| Ctrl+G | Go to a line number |
| Alt+C / Alt+W / Alt+R | (in the find bar) match case / whole word / regular expression |
| Ctrl+E | Export |
| F5 | Refresh |
| F2 / Del / Alt+Up / Alt+Down | Rename / delete / move chapter (in the file list) |

## Help
Questions, bugs or ideas: open an [issue](https://github.com/blaashford-ux/MDEdit/issues).

Developers: see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
