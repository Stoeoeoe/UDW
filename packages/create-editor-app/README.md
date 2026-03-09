# create-editor-app

Scaffold a new Electron + React + Chakra UI editor application in seconds.

## Quick Start

```bash
# Using npm
npm create editor-app my-app

# Using npx
npx create-editor-app my-app

# Or run interactively (no args)
npx create-editor-app
```

## What You Get

The CLI will prompt you for:

| Option | Default | Description |
|--------|---------|-------------|
| **Project name** | `my-editor-app` | Directory name & package name |
| **App title** | `My Editor` | Shown in title bar & Electron window |
| **Electron** | Yes | Desktop app with IPC handlers, preload, builder config |
| **Storybook** | No | Component development environment |
| **Vitest** | Yes | Unit testing with Testing Library |
| **Sidebar modes** | `dashboard,editor,settings` | Nav items generated automatically |

## Scaffolded Structure

```
my-app/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── electron-builder.json5      # (if Electron)
├── electron/                    # (if Electron)
│   ├── main.ts
│   ├── preload.ts
│   ├── ipcHandlers.ts
│   └── electron-env.d.ts
└── src/
    ├── main.tsx                 # Entry point with ChakraProvider
    ├── App.tsx                  # Generated with your modes
    ├── components/
    │   └── TopBar.tsx           # Customizable top bar
    ├── config/
    │   └── navigation.ts        # Generated nav items
    ├── store/
    │   └── useAppStore.ts       # Zustand + Immer starter store
    └── shell/                   # Editor shell components
        ├── index.ts
        ├── types.ts
        ├── theme/
        ├── layouts/             # AppShell, EditorLayout, ResizableEditorLayout
        ├── navigation/          # Sidebar, NavIcon
        ├── panels/              # PanelShell, ListPanel, InspectorPanel
        └── common/              # ViewportShell, Toolbar, EmptyScreen, etc.
```

## Included Dependencies

**Runtime:**
- React 18, Chakra UI v2, Emotion, Framer Motion
- Zustand (state management) + Immer (immutable updates)
- react-icons, react-resizable-panels

**Dev (optional):**
- Electron + electron-builder + vite-plugin-electron
- Vitest + Testing Library
- Storybook

## After Scaffolding

```bash
cd my-app
npm install
npm run dev        # Start dev server (or Electron window)
npm run test       # Run tests (if selected)
npm run storybook  # Launch Storybook (if selected)
npm run build      # Production build
```

## Customizing the Shell

The `src/shell/` directory contains all the editor shell components inline. You can:

1. **Edit directly** — modify anything in `src/shell/` for your project
2. **Swap to the npm package** — replace the inline shell with:
   ```bash
   npm install @editor-shell/react
   ```
   Then update `src/shell/index.ts`:
   ```ts
   export * from '@editor-shell/react';
   ```

## Adding New Modes

1. Add the mode to your `AppMode` type in `App.tsx`
2. Add a `NavItem` entry in `src/config/navigation.ts`
3. Add a `case` in the `renderContent()` switch in `App.tsx`
