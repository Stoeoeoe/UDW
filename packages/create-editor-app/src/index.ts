import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prompts from 'prompts';
import { red, green, cyan, bold, dim } from 'kolorist';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');

interface ProjectConfig {
  projectName: string;
  appTitle: string;
  electron: boolean;
  storybook: boolean;
  testing: boolean;
  navItems: string;
}

async function main() {
  console.log();
  console.log(
    bold(cyan('  create-editor-app')) +
      dim(' - scaffold a new editor application'),
  );
  console.log();

  // Get target directory from args or prompt
  let targetDir = process.argv[2];

  const response = await prompts(
    [
      {
        type: targetDir ? null : 'text',
        name: 'projectName',
        message: 'Project name:',
        initial: 'my-editor-app',
      },
      {
        type: 'text',
        name: 'appTitle',
        message: 'Application title (shown in title bar):',
        initial: 'My Editor',
      },
      {
        type: 'confirm',
        name: 'electron',
        message: 'Include Electron (desktop app)?',
        initial: true,
      },
      {
        type: 'confirm',
        name: 'storybook',
        message: 'Include Storybook?',
        initial: false,
      },
      {
        type: 'confirm',
        name: 'testing',
        message: 'Include Vitest + Testing Library?',
        initial: true,
      },
      {
        type: 'text',
        name: 'navItems',
        message:
          'Sidebar modes (comma-separated, e.g. "dashboard,editor,settings"):',
        initial: 'dashboard,editor,settings',
      },
    ],
    {
      onCancel: () => {
        console.log(red('✖') + ' Operation cancelled');
        process.exit(1);
      },
    },
  );

  const config: ProjectConfig = {
    projectName: targetDir || response.projectName,
    appTitle: response.appTitle,
    electron: response.electron,
    storybook: response.storybook,
    testing: response.testing,
    navItems: response.navItems,
  };

  targetDir = config.projectName;
  const root = path.resolve(process.cwd(), targetDir);

  if (fs.existsSync(root)) {
    const files = fs.readdirSync(root);
    if (files.length > 0) {
      const { overwrite } = await prompts({
        type: 'confirm',
        name: 'overwrite',
        message: `Directory "${targetDir}" is not empty. Overwrite?`,
        initial: false,
      });
      if (!overwrite) {
        console.log(red('✖') + ' Operation cancelled');
        process.exit(1);
      }
    }
  }

  console.log();
  console.log(`  Scaffolding project in ${cyan(root)}...`);
  console.log();

  // Create directory structure
  fs.mkdirSync(root, { recursive: true });

  // Copy base template
  copyDir(path.join(TEMPLATES_DIR, 'base'), root);

  // Copy electron template if selected
  if (config.electron) {
    copyDir(path.join(TEMPLATES_DIR, 'electron'), root);
  }

  // Generate dynamic files
  generatePackageJson(root, config);
  generateAppTsx(root, config);
  generateSidebarConfig(root, config);
  generateViteConfig(root, config);
  generateIndexHtml(root, config);

  if (config.electron) {
    generateElectronBuilder(root, config);
  }

  if (config.testing) {
    generateTestSetup(root);
  }

  console.log(green('  ✓ Project scaffolded successfully!'));
  console.log();
  console.log('  Next steps:');
  console.log();
  console.log(`    cd ${cyan(targetDir)}`);
  console.log(`    ${cyan('npm install')}`);
  console.log(`    ${cyan('npm run dev')}`);
  console.log();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function copyDir(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const file of fs.readdirSync(src)) {
    const srcFile = path.join(src, file);
    const destFile = path.join(dest, file);
    const stat = fs.statSync(srcFile);
    if (stat.isDirectory()) {
      copyDir(srcFile, destFile);
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
  }
}

function generatePackageJson(root: string, config: ProjectConfig) {
  const pkg: Record<string, any> = {
    name: config.projectName,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: config.electron
        ? 'tsc && vite build && electron-builder'
        : 'tsc && vite build',
      preview: 'vite preview',
      lint: 'eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0',
    },
    dependencies: {
      '@chakra-ui/icons': '^2.2.4',
      '@chakra-ui/react': '^2.10.9',
      '@emotion/react': '^11.14.0',
      '@emotion/styled': '^11.14.1',
      'framer-motion': '^11.18.2',
      immer: '^11.1.3',
      react: '^18.2.0',
      'react-dom': '^18.2.0',
      'react-icons': '^5.5.0',
      'react-resizable-panels': '^2.0.0',
      zustand: '^5.0.10',
    },
    devDependencies: {
      '@types/react': '^18.2.64',
      '@types/react-dom': '^18.2.21',
      '@types/node': '^25.0.10',
      '@vitejs/plugin-react': '^4.2.1',
      typescript: '^5.2.2',
      vite: '^5.1.6',
    },
  };

  if (config.electron) {
    pkg.main = 'dist-electron/main.js';
    pkg.devDependencies['electron'] = '^30.0.1';
    pkg.devDependencies['electron-builder'] = '^24.13.3';
    pkg.devDependencies['vite-plugin-electron'] = '^0.28.6';
    pkg.devDependencies['vite-plugin-electron-renderer'] = '^0.14.5';
  }

  if (config.testing) {
    pkg.scripts['test'] = 'vitest run';
    pkg.scripts['test:watch'] = 'vitest';
    pkg.devDependencies['vitest'] = '^4.0.18';
    pkg.devDependencies['jsdom'] = '^27.4.0';
    pkg.devDependencies['@testing-library/react'] = '^16.3.2';
    pkg.devDependencies['@testing-library/dom'] = '^10.4.1';
    pkg.devDependencies['@testing-library/user-event'] = '^14.6.1';
  }

  if (config.storybook) {
    pkg.scripts['storybook'] = 'storybook dev -p 6006';
    pkg.scripts['build-storybook'] = 'storybook build';
    pkg.devDependencies['storybook'] = '^10.2.0';
    pkg.devDependencies['@storybook/react-vite'] = '^10.2.0';
    pkg.devDependencies['@storybook/addon-docs'] = '^10.2.0';
    pkg.devDependencies['@storybook/addon-a11y'] = '^10.2.0';
  }

  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(pkg, null, 2) + '\n',
  );
}

function generateAppTsx(root: string, config: ProjectConfig) {
  const modes = config.navItems
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const modeType = modes.map((m) => `'${m}'`).join(' | ');
  const firstMode = modes[0] || 'dashboard';

  const content = `import React, { useState } from 'react';
import { Box, Flex, Center, VStack, Text } from '@chakra-ui/react';
import { AppShell, Sidebar, EmptyScreen } from './shell';
import { TopBar } from './components/TopBar';
import { NAV_ITEMS, BOTTOM_NAV_ITEMS } from './config/navigation';

export type AppMode = ${modeType};

function App() {
  const [mode, setMode] = useState<AppMode>('${firstMode}');

  const renderContent = () => {
    switch (mode) {
${modes
  .map(
    (m) => `      case '${m}':
        return (
          <EmptyScreen
            icon="${getDefaultIcon(m)}"
            title="${capitalize(m)}"
            description="This is the ${m} screen. Start building here!"
          />
        );`,
  )
  .join('\n')}
      default:
        return null;
    }
  };

  return (
    <AppShell topBar={<TopBar title="${config.appTitle}" />}>
      <Sidebar<AppMode>
        activeMode={mode}
        onModeChange={setMode}
        items={NAV_ITEMS}
        bottomItems={BOTTOM_NAV_ITEMS}
      />
      <Box flex={1} overflow="hidden">
        {renderContent()}
      </Box>
    </AppShell>
  );
}

export default App;
`;

  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'App.tsx'), content);
}

function generateSidebarConfig(root: string, config: ProjectConfig) {
  const modes = config.navItems
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const settingsLike = modes.find(
    (m) => m === 'settings' || m === 'preferences' || m === 'config',
  );
  const topModes = modes.filter((m) => m !== settingsLike);
  const bottomModes = settingsLike ? [settingsLike] : [];

  const content = `import type { NavItem } from '../shell';
import type { AppMode } from '../App';

export const NAV_ITEMS: NavItem<AppMode>[] = [
${topModes.map((m) => `  { mode: '${m}', icon: '${getDefaultIcon(m)}', label: '${capitalize(m)}' },`).join('\n')}
];

export const BOTTOM_NAV_ITEMS: NavItem<AppMode>[] = [
${bottomModes.map((m) => `  { mode: '${m}', icon: '${getDefaultIcon(m)}', label: '${capitalize(m)}' },`).join('\n')}
];
`;

  fs.mkdirSync(path.join(root, 'src', 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'config', 'navigation.ts'), content);
}

function generateViteConfig(root: string, config: ProjectConfig) {
  const imports: string[] = [
    `import { defineConfig } from 'vite';`,
    `import react from '@vitejs/plugin-react';`,
  ];
  const plugins: string[] = ['react()'];

  if (config.electron) {
    imports.push(`import path from 'node:path';`);
    imports.push(`import electron from 'vite-plugin-electron/simple';`);
    plugins.push(`electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    })`);
  }

  let testBlock = '';
  if (config.testing) {
    imports.unshift(`/// <reference types="vitest/config" />`);
    testBlock = `
  test: {
    globals: true,
    environment: 'jsdom',${config.testing ? `\n    setupFiles: ['./src/setupTests.ts'],` : ''}
  },`;
  }

  const content = `${imports.join('\n')}

export default defineConfig({
  plugins: [${plugins.join(', ')}],${testBlock}
});
`;

  fs.writeFileSync(path.join(root, 'vite.config.ts'), content);
}

function generateIndexHtml(root: string, config: ProjectConfig) {
  const content = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${config.appTitle}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

  fs.writeFileSync(path.join(root, 'index.html'), content);
}

function generateElectronBuilder(root: string, config: ProjectConfig) {
  const content = `{
  "$schema": "https://raw.githubusercontent.com/electron-userland/electron-builder/master/packages/app-builder-lib/scheme.json",
  "appId": "com.${config.projectName.replace(/[^a-z0-9]/gi, '')}.app",
  "asar": true,
  "productName": "${config.appTitle}",
  "directories": {
    "output": "release/\${version}"
  },
  "files": [
    "dist",
    "dist-electron"
  ],
  "mac": {
    "target": ["dmg"],
    "artifactName": "\${productName}-Mac-\${version}-Installer.\${ext}"
  },
  "win": {
    "target": [{ "target": "nsis", "arch": ["x64"] }],
    "artifactName": "\${productName}-Windows-\${version}-Setup.\${ext}"
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true,
    "deleteAppDataOnUninstall": false
  },
  "linux": {
    "target": ["AppImage"],
    "artifactName": "\${productName}-Linux-\${version}.\${ext}"
  }
}
`;

  fs.writeFileSync(path.join(root, 'electron-builder.json5'), content);
}

function generateTestSetup(root: string) {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'setupTests.ts'),
    `import '@testing-library/jest-dom';\n`,
  );
}

// ── Utility ──────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getDefaultIcon(mode: string): string {
  const iconMap: Record<string, string> = {
    dashboard: '📊',
    project: '📋',
    editor: '✏️',
    maps: '🗺️',
    tiles: '🎨',
    tilesets: '🎨',
    layers: '🧱',
    entities: '👾',
    terrain: '🧭',
    settings: '⚙️',
    preferences: '⚙️',
    config: '⚙️',
    assets: '📦',
    browser: '🔍',
    preview: '👁️',
    tools: '🔧',
    scene: '🎬',
    nodes: '🔗',
    scripts: '📝',
  };
  return iconMap[mode.toLowerCase()] || '📄';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
