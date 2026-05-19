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
