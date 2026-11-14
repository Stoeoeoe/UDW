# UI Conventions

## Core Rule
Build editor UI with Chakra theme tokens and shared editor primitives first. Add inline styling only when the color or layout is domain data, not editor chrome.

## Canonical Shells
- Use `AppShell` for the full app frame.
- Use `EditorWorkspaceShell` for editor screens with header and resizable regions.
- Use `InspectorShell`/`InspectorPanel` for inspector-style side panels.
- Use `PanelShell` for simple non-inspector panel surfaces.

## Fields And Lists
- Use `Field`, `InspectorSection`, `FieldStack`, `ReadOnlyIdField`, `CompactInput`, `CompactSelect`, and `InlineNumberPair` for editor forms.
- Prefer `ListPanel` and `DialogListWorkspace` for collection UIs.
- Enable built-in search on list-style panels when the items have `label`/`title` and `id`.

## Theme vs Component
- Add a theme token when the same raw color, border, or text treatment appears in more than one place.
- Add a shared component when the same group of Chakra props appears in more than one screen.
- Do not add new raw editor hex values in component files; use `npm run lint:ui` to catch regressions.

## Inline Styling Is Okay When
- The value is content-specific, like map overlays, debug colors, terrain previews, or renderer palettes.
- The style is truly one-off and not editor chrome.
