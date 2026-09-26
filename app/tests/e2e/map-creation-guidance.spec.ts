import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appDir, launchApp } from './helpers.js';

let app: ElectronApplication;
let window: Page;
let projectDir: string;

test.beforeEach(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), 'vulcan-map-guidance-'));
  ({ app, window } = await launchApp());

  await app.evaluate(({ dialog }, selectedDirectory) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [selectedDirectory],
    });
  }, projectDir);
});

test.afterEach(async () => {
  await app?.close();
  await rm(projectDir, { recursive: true, force: true });
});

test('guides a new project from map creation to tileset import', async () => {
  await window.getByRole('heading', { name: 'New Project' }).click();
  await window.getByLabel('Project Name').fill('Guidance Test');
  await window.getByLabel('Project ID').fill('guidance-test');
  await window.getByRole('button', { name: 'Create Project' }).click();

  await expect(window.getByText('Project', { exact: true })).toBeVisible();
  await window.getByRole('button', { name: 'Create Locations' }).click();

  await expect(window.getByText('Create Map', { exact: true })).toBeVisible();
  await expect(window.getByText('Create a tileset first')).toBeVisible();
  await expect(window.getByText('Base Tileset')).toHaveCount(0);
  await expect(window.getByRole('button', { name: 'Import Tileset' })).toBeVisible();

  await window.screenshot({
    path: path.join(appDir, 'test-results', 'map-creation-guidance.png'),
  });

  await window.getByRole('button', { name: 'Import Tileset' }).click();
  await expect(window.getByRole('button', { name: 'Create Tileset', exact: true })).toBeVisible();

  await window.getByRole('button', { name: 'Cancel' }).last().click();
  await expect(window.getByText('Create a tileset first')).toBeVisible();
});
