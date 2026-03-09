/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string;
    VITE_PUBLIC: string;
  }
}

interface Window {
  ipcRenderer: import('electron').IpcRenderer;
}


### Panels
- **`PanelShell`** — Styled container with header + scrollable body
- **`ListPanel`** — Selectable item list with add/remove actions
- **`InspectorPanel`** — Right-side property inspector with sections

### Common
- **`ViewportShell`** — Viewport container with header bar
- **`ZoomControls`** — Floating zoom in/out/reset bar
- **`Toolbar`** — Grouped icon toolbar (react-icons)
- **`EditorModal`** — Consistent dark-themed modal wrapper
- **`EmptyScreen`** — Centered empty state placeholder
- **`PropertyForm`** — Schema-driven property editor (string, number, boolean, enum, custom)

### Theme
- **`editorTheme`** — Pre-built dark Chakra UI theme
- **`createEditorTheme(overrides)`** — Extend the base theme

## Usage

```tsx
import { ChakraProvider } from '@chakra-ui/react';
import {
  AppShell, Sidebar, EditorLayout, ListPanel, InspectorPanel,
  editorTheme, NavItem,
} from '@editor-shell/react';

type MyMode = 'dashboard' | 'editor' | 'settings';

const NAV: NavItem<MyMode>[] = [
  { mode: 'dashboard', icon: '📊', label: 'Dash' },
  { mode: 'editor',    icon: '✏️', label: 'Edit' },
];

function App() {
  const [mode, setMode] = useState<MyMode>('dashboard');
  return (
    <ChakraProvider theme={editorTheme}>
      <AppShell topBar={<MyTopBar />}>
        <Sidebar activeMode={mode} onModeChange={setMode} items={NAV} />
        <EditorLayout
          header={{ title: mode }}
          content={<MyCanvas />}
          leftPanel={<ListPanel title="Items" items={items} />}
          rightPanel={<InspectorPanel title="Properties" />}
        />
      </AppShell>
    </ChakraProvider>
  );
}
```

## Peer Dependencies

- React 18+
- Chakra UI v2
- react-icons
- react-resizable-panels
- framer-motion
