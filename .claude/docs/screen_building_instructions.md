# Screen Building Instructions

Use this guide whenever you add or refactor an editor-like screen.

## Which Layout to Use

### ResizableEditorLayout — list + detail form side by side

Use when selecting an item should immediately show its editable form without a separate click. The form lives in the center as a card. Good for: EntityEditor, ActorEditor.

```
ResizableEditorLayout
├── leftPanel:  ListPanel (list + add/delete)
└── content:    card-wrapped detail form, or EmptyScreen when nothing selected
```

The `content` slot renders a full-height scrollable area with a centered card:

```tsx
content={selectedItem ? (
  <Box h="full" overflowY="auto" p={6} bg="#0d0f1a">
    <Box maxW="760px" mx="auto" bg="editor.panelBg" border="1px" borderColor="whiteAlpha.100" borderRadius="lg" overflow="hidden">
      <ItemDetail ... />
    </Box>
  </Box>
) : <EmptyScreen ... />}
```

- The outer `bg="#0d0f1a"` gives a slightly lighter backdrop so the card has visible depth.
- The inner card uses `bg="editor.panelBg"` with a `whiteAlpha.100` border for subtle definition.
- `ItemDetail` renders `<Box p={6}><VStack ...>` — no `overflowY`/`h="full"` needed (scrolling is on the outer Box).
- Use `EmptyScreen` for the zero-items and no-selection states.
- Put the delete button at the bottom of the form.
- Do **not** use `rightPanel` — the form goes in `content`, no separate right panel.

### TopTabbedEditorLayout + DialogListWorkspace — tabbed list + modal CRUD

Use when items are simple enough that create/edit fits in a modal, or when one screen manages multiple categories of items. Good for: MapSettingsEditor, VariableEditor.

```
TopTabbedEditorLayout
└── mainContent: DialogListWorkspace (list + "Add X" button)
    └── onAdd / onOpenItem → EditorModal > EntityFormDialog (single-item form)
```

**Key rule:** Always create the item in the store first, then open the dialog with `initialExpandedId`. Never put an "Add" button inside the modal.

---

## Reusable Building Blocks

- `ResizableEditorLayout` — shell with resizable left/right/bottom panels and optional header
- `ListPanel` — left-side list with add/delete/search
- `TopTabbedEditorLayout` — tabbed layout with badge counts, optional sidebar and footer slot
- `DialogListWorkspace` — list manager used as tab content; emits `onAdd` and `onOpenItem`
- `EntityFormDialog` — modal form shell (title + children + cancel/submit footer)
- `EmptyScreen` — full-area placeholder with optional CTA button
- `EditorModal` — Chakra modal wrapper with consistent sizing
- `InspectorPanel` + `InspectorEmptyState` — right-side inspector (use only when there's a meaningful center canvas, e.g. map editor)

---

## Left Panel Pattern

Use `ListPanel` as the default for navigable item lists.

- Provide `onAdd` for the top-right plus button.
- Use `selectedId` + `onSelect` for selection state.
- Use `onDeleteItem` for delete confirmation.
- Use `topContent` for a search/filter row.

---

## DRY Rules

- Prefer extending shared `common` components over duplicating screen-specific variants.
- Keep screen files focused on state wiring and domain logic, not layout primitives.
- For sub-editors used inside modals (e.g. TableEditor): hide their header/add button when `initialExpandedId` is set — derive this from `!!initialExpandedId`, no separate `singleMode` prop needed.
