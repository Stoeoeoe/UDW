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
- `InspectorPanel` and `InspectorEmptyState` (`app/src/components/screens/common/InspectorPanel.tsx`)
- `EmptyScreen` (`app/src/components/screens/common/EmptyScreen.tsx`)

## Left Panel Pattern

Use `ListPanel` as the default for entity/layer/tileset/dialogue lists.

Required behavior:

- Provide `onAdd` so the top-right plus button creates a new item.
- Use `selectedId` + `onSelect` for deterministic selection state.
- Use `itemActions` for hover actions (for example edit metadata and delete).
- Use `topContent` when a filter/search row is needed.
- Avoid ad-hoc list row implementations unless the screen has a unique structural need.

## Hover Actions Pattern

When an item supports metadata editing and deletion:

- Add an edit action in `itemActions` that opens metadata/editor UI.
- Add a delete action in `itemActions` with destructive coloring and confirmation.
- Keep action handlers side-effect safe (stop row selection side effects unless intended).

## Right Inspector Pattern

The right panel should always represent current selection context.

- No selection: render `InspectorEmptyState` with actionable hint text.
- Selection present: render form controls grouped by concern.
- If multiple contexts are possible, switch inspector content by priority (selected object first, fallback to tool/global state).

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
