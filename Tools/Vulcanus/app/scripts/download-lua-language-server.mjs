#!/usr/bin/env node
/**
 * Downloads the lua-language-server binary for the current platform.
 * Run via: node scripts/download-lua-language-server.mjs
 *
 * Places the binary in: app/resources/lua-language-server/
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEST_DIR = path.resolve(__dirname, '..', 'resources', 'lua-language-server');

// LuaLS release version to download
const VERSION = '3.13.6';

function getPlatformAsset() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32' && arch === 'x64') {
    return `lua-language-server-${VERSION}-win32-x64.zip`;
  }
  if (platform === 'darwin' && arch === 'x64') {
    return `lua-language-server-${VERSION}-darwin-x64.tar.gz`;
  }
  if (platform === 'darwin' && arch === 'arm64') {
    return `lua-language-server-${VERSION}-darwin-arm64.tar.gz`;
  }
  if (platform === 'linux' && arch === 'x64') {
    return `lua-language-server-${VERSION}-linux-x64.tar.gz`;
  }
  if (platform === 'linux' && arch === 'arm64') {
    return `lua-language-server-${VERSION}-linux-arm64.tar.gz`;
  }
  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

async function downloadFile(url, destPath) {
  console.log(`Downloading ${url} ...`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const fileStream = fs.createWriteStream(destPath);
  await pipeline(res.body, fileStream);
  console.log(`Saved to ${destPath}`);
}

async function extractTarGz(archivePath, destDir) {
  console.log(`Extracting ${archivePath} to ${destDir} ...`);
  execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, { stdio: 'inherit' });
}

async function extractZip(archivePath, destDir) {
  console.log(`Extracting ${archivePath} to ${destDir} ...`);
  // Use PowerShell on Windows for zip extraction
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Force -Path '${archivePath}' -DestinationPath '${destDir}'"`,
      { stdio: 'inherit' },
    );
  } else {
    execSync(`unzip -o "${archivePath}" -d "${destDir}"`, { stdio: 'inherit' });
  }
}

async function main() {
  const asset = getPlatformAsset();
  const url = `https://github.com/LuaLS/lua-language-server/releases/download/${VERSION}/${asset}`;

  // Clean and create destination
  await fsp.rm(DEST_DIR, { recursive: true, force: true });
  await fsp.mkdir(DEST_DIR, { recursive: true });

  const archivePath = path.join(DEST_DIR, asset);
  await downloadFile(url, archivePath);

  if (asset.endsWith('.tar.gz')) {
    await extractTarGz(archivePath, DEST_DIR);
  } else {
    await extractZip(archivePath, DEST_DIR);
  }

  // Remove archive after extraction
  await fsp.unlink(archivePath);

  // Verify executable exists
  const exeName = process.platform === 'win32' ? 'bin/lua-language-server.exe' : 'bin/lua-language-server';
  const exePath = path.join(DEST_DIR, exeName);
  try {
    await fsp.access(exePath, fs.constants.X_OK | fs.constants.F_OK);
    console.log(`lua-language-server ready at ${exePath}`);
  } catch {
    // On Windows the exe might be at the root level
    const altPath = path.join(DEST_DIR, process.platform === 'win32' ? 'lua-language-server.exe' : 'lua-language-server');
    try {
      await fsp.access(altPath, fs.constants.F_OK);
      console.log(`lua-language-server ready at ${altPath}`);
    } catch {
      console.warn('Warning: could not verify lua-language-server executable. Check resources/lua-language-server/ manually.');
    }
  }
}

main().catch((err) => {
  console.error('Failed to download lua-language-server:', err);
  process.exit(1);
});
