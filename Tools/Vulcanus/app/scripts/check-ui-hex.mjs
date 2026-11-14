import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'src');
const strict = process.argv.includes('--strict');

const collectFiles = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const nested = entries.flatMap((entry) => {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(fullPath);
    }
    return fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') ? [fullPath] : [];
  });
  return nested;
};

const files = collectFiles(resolve(root, 'components'));

const bannedHexes = ['#0a0a0b', '#05060a', '#03040a', '#071018', '#0b1116', '#1a1a2e'];
const violations = [];

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  for (const hex of bannedHexes) {
    if (content.includes(hex)) {
      violations.push({ file, hex });
    }
  }
}

if (violations.length === 0) {
  console.log('No banned raw UI hex values found.');
  process.exit(0);
}

const logger = strict ? console.error : console.warn;
logger('Banned raw UI hex values found. Move these to theme tokens or shared field/shell primitives:');
for (const violation of violations) {
  logger(`- ${violation.hex} in ${violation.file}`);
}
if (!strict) {
  console.warn('Run `npm run lint:ui:strict` to make this fail the build.');
  process.exit(0);
}

process.exit(1);
