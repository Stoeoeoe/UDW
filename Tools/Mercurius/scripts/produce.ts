import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectRoot, validateEpisodes } from './episodes';

try {
  const [mode, id = 'demo', rawFrame = '330'] = process.argv.slice(2);
  if (mode !== 'still' && mode !== 'render')
    throw new Error('Expected still or render');
  const episodes = await validateEpisodes();
  const selected = episodes.find(({ episode }) => episode.id === id);
  if (!selected)
    throw new Error(
      `Unknown episode '${id}'. Available: ${episodes.map(({ episode }) => episode.id).join(', ')}`,
    );
  const frame = Number(rawFrame);
  if (
    mode === 'still' &&
    (!Number.isInteger(frame) ||
      frame < 0 ||
      frame >= selected.episode.durationInFrames)
  )
    throw new Error(
      `Still frame must be an integer from 0 to ${selected.episode.durationInFrames - 1}`,
    );
  await mkdir(resolve(projectRoot, 'out'), { recursive: true });
  const output = mode === 'still' ? `out/${id}-${frame}.png` : `out/${id}.mp4`;
  const args = [
    resolve(projectRoot, 'node_modules/@remotion/cli/remotion-cli.js'),
    mode,
    'src/index.ts',
    id,
    output,
  ];
  if (mode === 'still') args.push(`--frame=${frame}`);
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  child.on('error', (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
