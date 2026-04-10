#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

const root = process.cwd();
const ignore = new Set([
  'node_modules',
  '.git',
  'build',
  'dist',
  'dist-electron',
  'release',
  'public',
  'test_app',
  'test_app_2',
]);

// Broad emoji ranges — detects most common emoji code points
const emojiRegex =
  /[\u{1F300}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu;

const textFileExts = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.mdx',
  '.html',
  '.css',
  '.scss',
  '.json5',
  '.yaml',
  '.yml',
  '.txt',
]);

async function walk(dir, cb) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (ignore.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, cb);
    else await cb(full);
  }
}

const report = { files: {}, emojis: {} };

function isTextFile(file) {
  const ext = path.extname(file).toLowerCase();
  return (
    textFileExts.has(ext) || file.includes('README') || file.includes('LICENSE')
  );
}

async function scanFile(file) {
  if (!isTextFile(file)) return;
  let content;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch {
    return;
  }
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    while ((m = emojiRegex.exec(line)) !== null) {
      const ch = m[0];
      report.files[file] = report.files[file] || [];
      report.files[file].push({
        line: i + 1,
        column: m.index + 1,
        char: ch,
        context: line.trim().slice(0, 200),
      });
      report.emojis[ch] = (report.emojis[ch] || 0) + 1;
    }
  }
}

(async () => {
  try {
    await walk(root, scanFile);
    const sorted = Object.entries(report.emojis).sort((a, b) => b[1] - a[1]);
    const summary = sorted
      .slice(0, 30)
      .map(([ch, c]) => ({ emoji: ch, count: c }));
    const out = {
      summary,
      totalEmojiTypes: sorted.length,
      totalFiles: Object.keys(report.files).length,
      files: report.files,
    };
    await fs.writeFile(
      path.join(root, 'emojis-report.json'),
      JSON.stringify(out, null, 2),
      'utf8',
    );
    console.log(
      'Emoji scan complete. Found',
      sorted.length,
      'unique emoji codepoints in',
      Object.keys(report.files).length,
      'files.',
    );
    console.log('Report written to emojis-report.json');
    if (sorted.length) {
      console.log(
        'Top results:\n',
        summary.map((s) => `${s.emoji}  x${s.count}`).join('\n'),
      );
    } else console.log('No emoji characters found.');
  } catch (err) {
    console.error('scan failed:', err);
    process.exit(1);
  }
})();
