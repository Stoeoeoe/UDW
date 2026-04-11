# Screen Building Instructions

Use this guide whenever you add or refactor an editor-like screen.

## Core Layout Contract

Use `ResizableEditorLayout` for every screen that follows the editor shell pattern.

Expected composition:

1. Left panel: navigable list of domain items.
2. Center content: main workspace where editing happens.
3. Right panel: context-sensitive inspector for the current selection.
4. Bottom panel (optional): debug, palette, auxiliary tools, or mode-specific detail.

## Reusable Building Blocks

- `ResizableEditorLayout` (`app/src/components/screens/common/ResizableEditorLayout.tsx`)
- `ListPanel` (`app/src/components/screens/common/ListPanel.tsx`)
- `EntityFormDialog` (`app/src/components/screens/common/EntityFormDialog.tsx`)
- `useEntityFormDraft` (`app/src/components/screens/common/useEntityFormDraft.ts`)
- `InspectorPanel` and `InspectorEmptyState` (`app/src/components/screens/common/InspectorPanel.tsx`)
- `EmptyScreen` (`app/src/components/screens/common/EmptyScreen.tsx`)

## Entity + Forms Model

Treat each editor as a collection of entities plus one or more forms.

Core model:

1. Collection list: stable selection, add action, hover edit/delete actions.
2. Create form: modal form used to create a new entity.
3. Edit form: inspector form bound to the selected entity.
4. Draft lifecycle: selected entity mapped to draft state via `useEntityFormDraft`.

Rules:

- Prefer one draft object per selected entity instead of many independent field states.
- Reuse `EntityFormDialog` for create/edit modal shells.
- Keep create and edit validation rules aligned where possible.
- Prefer list hover actions (`itemActions`) over burying edit/delete only in inspector danger zones.
- Prefer `onEditItem` and `onDeleteItem` on `ListPanel` for standard edit/delete actions.

## Left Panel Pattern

Use `ListPanel` as the default for entity/layer/tileset/dialogue lists.

Required behavior:

- Provide `onAdd` so the top-right plus button creates a new item.
- Use `selectedId` + `onSelect` for deterministic selection state.
- Use `itemActions` for hover actions (for example edit metadata and delete).
- Prefer `onEditItem` + `onDeleteItem` first for common edit/delete actions.
- Use `topContent` when a filter/search row is needed.
- Avoid ad-hoc list row implementations unless the screen has a unique structural need.

## Hover Actions Pattern

When an item supports metadata editing and deletion:

- Add an edit action in `itemActions` that opens metadata/editor UI.
- Add a delete action in `itemActions` with destructive coloring and confirmation.
- Keep action handlers side-effect safe (stop row selection side effects unless intended).

For common cases, use:

- `onEditItem` callback only.
- `onDeleteItem` callback only.

Use custom `itemActions` only for additional non-standard actions.

## Right Inspector Pattern

The right panel should always represent current selection context.

- No selection: render `InspectorEmptyState` with actionable hint text.
- Selection present: render form controls grouped by concern.
- If multiple contexts are possible, switch inspector content by priority (selected object first, fallback to tool/global state).
- For delete affordances, prefer `InspectorPanel` footer with `onDelete` and `deleteLabel` instead of ad-hoc danger blocks.

## Bottom Panel Pattern

Use `bottomPanel` only when there is a secondary workflow that benefits from persistent visibility.

Examples:

- tileset palette
- debug output
- mode-specific link/entity helpers

If the active mode does not need it, pass `undefined` or `null`.

## DRY Rules

- Prefer extending shared `common` components over duplicating screen-specific variants.
- If two screens repeat panel/list/inspector behavior, move that behavior into `common` first.
- Keep screen files focused on state wiring and domain logic, not repeated layout primitives.

## Acceptance Checklist For New Screens

- Uses `ResizableEditorLayout`.
- Uses `ListPanel` for left navigation list.
- Uses `InspectorPanel` for right context editing.
- Uses `itemActions` for hover edit/delete when applicable.
- Uses `topContent` for list filtering when needed.
- Keeps optional bottom panel mode-aware.
