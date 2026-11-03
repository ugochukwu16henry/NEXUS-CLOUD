# Files in and out: laptop, phone and a local folder

Where the owner's files come from and go to on the Code tab. Choose a task and start its branch first; everything below works on that task's change set, and commits still happen from the Code tab.

## Bring files in

| From       | How                                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Laptop     | **Upload files**, **Upload folder**, or drag files and folders onto the drop zone. The folder structure is kept.                                                        |
| Phone      | **Upload files** opens photos and files. Phones can't pick a folder: zip it first (Files app → Compress on iPhone, or a file manager on Android), then **Upload .zip**. |
| Any device | **Upload .zip**. The zip is unpacked in the browser; Finder and Windows clutter (`__MACOSX`, `.DS_Store`, `Thumbs.db`) is dropped.                                      |

Every file then goes through the same checks as any upload: skipped folders (`node_modules` and the rest from Workspace settings), size and count limits, type by content, and the secret scan (secrets are held back until you decide). A zip whose listed sizes add up past the limits is refused before it is unpacked, so a zip bomb never expands. Raise the limits in Project → Settings → Workspace.

## Get files out

**Download .zip** (Code tab toolbar) saves the whole repository with this task's changes on top, or the default branch when no task is chosen. Nothing is left out. Each download is in the audit log (`code.export`). On a phone the browser saves it to Downloads/Files.

## Work in a folder on your computer

Chrome or Edge on a laptop (phones and Safari have no folder access; use the zips there).

1. **Open a folder.** Pick an empty folder to make a local copy, or the folder that already holds your copy. The browser asks once for permission to edit it.
2. **Bring into folder** writes the task's files (repository plus changes) that differ from what's in the folder. Open the folder in VS Code or any editor and work.
3. **Send to Nexus** uploads the files in the folder that differ from the task, through the normal upload checks. They appear under Changes.

Files are compared by content. Nothing is deleted on either side: delete a file in Nexus from Changes, and in the folder yourself. Skipped folders (`node_modules`, `.git` and the rest) are never sent. Nexus only touches the folder when you press a button, and forgets it when you leave the page.

## Repositories

Project → Repository → **Import repository** lists every repository the Nexus GitHub App can see. To add another, Settings → Integrations → Change repository access, tick it, and import. Importing someone else's public repository by URL is not supported yet.
