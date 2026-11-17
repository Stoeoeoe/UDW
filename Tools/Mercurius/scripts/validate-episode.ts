import { validateEpisodes } from './episodes';

try {
  const episodes = await validateEpisodes();
  console.log(
    `Validated ${episodes.length} episode(s): ${episodes.map(({ episode }) => episode.id).join(', ')}`,
  );
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
