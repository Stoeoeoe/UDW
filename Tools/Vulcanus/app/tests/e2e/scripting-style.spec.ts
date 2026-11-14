import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appDir, launchApp } from './helpers.js';

let app: ElectronApplication;
let window: Page;
let projectDir: string;

test.beforeEach(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), 'vulcan-scripting-style-'));
  ({ app, window } = await launchApp());

  await app.evaluate(({ dialog }, selectedDirectory) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [selectedDirectory],
    });
  }, projectDir);

  await window.getByRole('heading', { name: 'New Project' }).click();
  await window.getByLabel('Project Name').fill('Scripting Style Test');
  await window.getByLabel('Project ID').fill('scripting-style-test');
  await window.getByRole('button', { name: 'Create Project' }).click();
  await expect(window.getByText('Scripting', { exact: true }).first()).toBeVisible();
});

test.afterEach(async () => {
  if (app) {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().forEach((openWindow) => openWindow.destroy());
    });
    await app.close();
  }
  await rm(projectDir, { recursive: true, force: true });
});

test('scripting resource dialogs share compact field styling', async () => {
  const emptyState = window.getByText('No variables').locator('..');
  await expect(emptyState).toBeVisible();
  expect(
    await emptyState.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe('rgb(10, 10, 11)');
  await window.screenshot({
    path: path.join(appDir, 'test-results', 'scripting-empty-state.png'),
  });

  const resources = [
    { tab: 'Tables', add: 'Add Table', nestedAdds: ['Add field'] },
    { tab: 'Functions', add: 'Add Function', nestedAdds: ['Add param'] },
    {
      tab: 'Namespaces',
      add: 'Add Namespace',
      nestedAdds: ['Add field', 'Add function'],
    },
    { tab: 'Contexts', add: 'Add Context', nestedAdds: ['Add field', 'Add function'] },
  ];
  const fieldStyles: Array<Record<string, string>> = [];

  for (const resource of resources) {
    await window.getByRole('button', { name: resource.tab, exact: true }).click();
    await window.getByRole('button', { name: resource.add, exact: true }).click();

    const dialog = window.getByRole('dialog');
    for (const nestedAdd of resource.nestedAdds) {
      await dialog.getByRole('button', { name: nestedAdd, exact: true }).click();
    }

    const firstInput = dialog.locator('input').first();
    await expect(firstInput).toBeVisible();
    fieldStyles.push(
      await firstInput.evaluate((element) => {
        element.blur();
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderRadius: style.borderRadius,
          color: style.color,
          fontSize: style.fontSize,
          height: style.height,
        };
      }),
    );

    const controlChrome = await dialog.locator('input, select').evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderRadius: style.borderRadius,
          fontSize: style.fontSize,
          height: style.height,
        };
      }),
    );
    for (const style of controlChrome.slice(1)) {
      expect(style).toEqual(controlChrome[0]);
    }

    if (resource.tab === 'Contexts') {
      await window.screenshot({
        path: path.join(appDir, 'test-results', 'scripting-context-style.png'),
      });
    }

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();
  }

  for (const style of fieldStyles.slice(1)) {
    expect(style).toEqual(fieldStyles[0]);
  }
});
