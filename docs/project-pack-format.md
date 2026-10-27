# MDEdit project pack (format version 1)

Produced by **Export project…** on the Projects home; read by **Import Project…** (here, or in another MDEdit) and
intended for Cadrel to import as a project under its Studio. A pack is a plain `.zip` named `<Project>.mdedit.zip`.

```
mdedit-pack.json            manifest (UTF-8 JSON)
project/                    the project folder exactly as on disk
  .mdedit/project.json      project metadata (always present)
  Manuscript/Draft.md …     every other file and folder, any depth
```

Writing history (`.mdedit/progress*.json`), `.bak` copies and OS junk files are not packed.

## Manifest

```json
{
  "format": "mdedit-project-pack",
  "formatVersion": 1,
  "exportedAt": "2026-10-27T12:00:00.000Z",
  "app": { "name": "MDEdit", "version": "0.3.0" },
  "project": {
    "id": "…", "name": "The Lost King", "templateId": "novel", "templateName": "Novel",
    "status": "drafting", "words": 61234, "activeManuscript": "Manuscript/Draft.md"
  },
  "files": [{ "path": ".mdedit/project.json", "size": 612 }]
}
```

`files` paths are relative to `project/`, `/`-separated. A reader must reject a pack whose `format` differs or whose
`formatVersion` is higher than it knows. `.mdedit/project.json` carries goals, the active manuscript, excluded folders and
book defaults (see `ProjectMeta` in `src/shared/projects.ts`); unknown fields should be ignored.

## Reading rules (import safety)

Entries outside `project/` other than the manifest are ignored. Every path under `project/` must be relative with no `..`,
empty, drive or backslash parts. MDEdit also caps a pack at 50,000 entries and 2 GB uncompressed. It unpacks into a hidden
temporary folder and renames it into the Root Folder at the end; a name already taken gets a number added, and the project
`id` is renewed if another project in the Root already uses it.
