import { readFile } from 'node:fs/promises';

const [command = 'help', argument] = process.argv.slice(2);
if (command === 'help') {
  console.log(`Mercurius clips — start npm run playground first
  npm run clips -- list
  npm run clips -- save path/to/clip.json
  npm run clips -- render clip-id
  npm run clips -- status
  npm run clips -- cancel render-id
  npm run clips -- filmcraft
  npm run clips -- launch [path/to/project.fcproj]
  npm run clips -- sequence path/to/sequence-request.json
  npm run clips -- handoff path/to/request.json

handoff request: {mode: import|place|occurrence|all, clipId, revisionId,
stamp: from filmcraft inspection, track/frame or targetClip/targetItem}
Manual UI and these commands call the same local service. Files and targets
are validated there. Handoffs never run arbitrary shell/FilmCraft commands.`);
} else {
  try {
    const routes: Record<string, { path: string; data?: unknown }> = {
      list: { path: 'state' },
      status: { path: 'state' },
      filmcraft: { path: 'filmcraft' },
      save: {
        path: 'save',
        data:
          command === 'save'
            ? JSON.parse(await readFile(argument, 'utf8'))
            : undefined,
      },
      render: { path: 'render', data: { id: argument } },
      cancel: { path: 'cancel', data: { id: argument } },
      launch: {
        path: 'launch',
        data: argument ? { projectPath: argument } : {},
      },
      handoff: {
        path: 'handoff',
        data:
          command === 'handoff'
            ? JSON.parse(await readFile(argument, 'utf8'))
            : undefined,
      },
      sequence: {
        path: 'sequence',
        data:
          command === 'sequence'
            ? JSON.parse(await readFile(argument, 'utf8'))
            : undefined,
      },
    };
    const route = routes[command];
    if (!route)
      throw new Error(
        `Unknown command: ${command}. Use npm run clips -- help.`,
      );
    const response = await fetch(
      `http://127.0.0.1:3109/api/clips/${route.path}`,
      route.data === undefined
        ? {}
        : {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Mercurius': 'workbench',
            },
            body: JSON.stringify(route.data),
          },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
