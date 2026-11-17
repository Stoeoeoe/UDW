import { scaffoldEpisode } from './episodes';

try {
  const id = await scaffoldEpisode(process.argv[2] ?? '');
  console.log(
    `Created episodes/${id} and public/episodes/${id}.\nNext: review the brief and script, then import Episode and episode in src/Root.tsx and register a Composition (see demo).\nRun npm run format and npm run validate.`,
  );
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
