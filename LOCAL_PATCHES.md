# Local Nim Patch Ledger

This branch carries VTU-specific Nimbalyst customizations on top of upstream `origin/main`.
Keep each customization in its own commit when practical so upstream updates can be rebased and conflicts can be resolved narrowly.

## Update Workflow

1. Fetch upstream changes:
   ```powershell
   git fetch origin
   ```
2. Rebase this branch:
   ```powershell
   git rebase origin/main
   ```
3. Resolve conflicts, if any, then continue:
   ```powershell
   git rebase --continue
   ```
4. Verify:
   ```powershell
   npm run typecheck --prefix packages/electron
   ```

`git rerere` should stay enabled in this clone so repeated conflict resolutions are remembered.

## Active Local Patches

### Show Tracker Tags On Kanban Cards

- Date added: 2026-05-19
- Commit: `Show tracker tags on kanban cards`
- File: `packages/electron/src/renderer/components/TrackerMode/KanbanBoard.tsx`
- Purpose: show ordinary tracker `tags` on tracker kanban cards, not only `primaryType`, secondary type tags, and priority.
- Behavior: each card shows up to four ordinary tag chips in a wrapped row below the type/priority row, with `+N` overflow for additional tags. Tracker search also matches ordinary tags.
- Verification: open VTU in Tracker > Kanban view and confirm cards with tags show chips such as `pad-migration`, `pad:tasks`, and `area:gdd`.

### Toggle Content Images To Window Size

- Date added: 2026-05-19
- Commit: `Toggle content images to window size`
- File: `packages/runtime/src/editor/plugins/ImagesPlugin/ImageComponent.tsx`
- File: `packages/runtime/src/editor/index.css`
- Purpose: let screenshots and other content images expand to a Nim-window-sized preview without changing the document image dimensions.
- Behavior: clicking a content image opens a centered window overlay; clicking the overlay image again or pressing Escape returns to the normal content view.
- Verification: open a tracker item with a screenshot in Content view, click the screenshot, confirm it fills the Nim window, then click it again to close.

### Add MkDocs Mode To Left Bar

- Date added: 2026-05-19
- Commit: `Add MkDocs mode to left bar`
- File: `packages/electron/src/main/ipc/MkDocsHandlers.ts`
- File: `packages/electron/src/renderer/components/DocsMode/DocsMode.tsx`
- File: `packages/electron/src/renderer/components/NavigationGutter/NavigationGutter.tsx`
- File: `packages/electron/src/renderer/App.tsx`
- Purpose: open the workspace MkDocs browser inside Nim so VTU `Doc/GDD` can be read without a separate browser window.
- Behavior: the left bar has a MkDocs button. For workspaces with `mkdocs.yml` and `tools/gdd-docs.ps1`, Nim starts or reuses `http://127.0.0.1:8000/` and embeds it in a Docs mode iframe. Workspaces without that setup show an unavailable state.
- Verification: open VTU in Nim, click the MkDocs left-bar icon, confirm the Docs mode iframe renders the local MkDocs site, and use refresh/open-in-browser controls as needed.

### Fullscreen Tracker Card Content

- Date added: 2026-05-19
- Commit: `Fullscreen tracker card content`
- File: `packages/electron/src/renderer/components/TrackerMode/TrackerItemDetail.tsx`
- Purpose: let tracker card content use the full Nim window instead of the narrow detail panel.
- Behavior: native tracker card detail panels show a fullscreen icon beside `Card Content`. Clicking it opens the content editor in a full-window overlay; clicking the exit icon or pressing Escape returns to the normal detail panel.
- Verification: open a native tracker card with body content, click the fullscreen icon beside `Card Content`, confirm the content editor fills the Nim window, then exit fullscreen and confirm the card detail remains open.
