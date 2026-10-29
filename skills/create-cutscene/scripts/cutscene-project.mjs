import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const help = `Usage:
  node cutscene-project.mjs inspect --editor <checkout> --project <file.vproj> --bindings <bindings.json> [--map <id>] [--query <text>]
  node cutscene-project.mjs validate --editor <checkout> --project <file.vproj> --bindings <bindings.json> --scene <source.json>
Reads live contracts and project data. Never modifies files.`;

async function json(file) {
  return JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
}

async function files(folder) {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return []; // Content folders can be intentionally empty/absent.
    throw error;
  }
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(path.join(folder, entry.name))
        : [path.join(folder, entry.name)],
    ),
  );
  return nested.flat().sort();
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help") {
    console.log(help);
    return;
  }
  if (!["inspect", "validate"].includes(command)) throw new Error(help);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      ![
        "--editor",
        "--project",
        "--bindings",
        "--scene",
        "--map",
        "--query",
      ].includes(args[i]) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new Error(help);
    options[args[i].slice(2)] = args[i + 1];
  }
  for (const key of [
    "editor",
    "project",
    "bindings",
    ...(command === "validate" ? ["scene"] : []),
  ])
    if (!options[key]) throw new Error(`Missing --${key}.\n${help}`);

  const editor = path.resolve(options.editor);
  const projectFile = path.resolve(options.project);
  const projectRoot = path.dirname(projectFile);
  const bindingsFile = path.resolve(options.bindings);
  const app = path.join(editor, "app");
  const require = createRequire(path.join(app, "package.json"));
  const { build } = require("esbuild");
  const Ajv = require("ajv");
  const module = { exports: {} };
  const source = (file) =>
    JSON.stringify(path.join(app, "src", "lib", file).replaceAll("\\", "/"));
  const bundle = await build({
    stdin: {
      contents: `
      export { parseCutscene, validateCutscene, exportCutscene, mapCharacterInstances } from ${source("cutscenes.ts")};
      export { parseScriptingManifest, getManifestActions, getManifestGraphFunctions, withProjectCharacters } from ${source("scriptingManifest.ts")};
      export { resourceRegistry, getResourceDefinition, resourceFilename } from ${source("resourceRegistry.ts")};
    `,
      resolveDir: app,
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    target: "node20",
    alias: {
      fengari: path.join(
        app,
        "node_modules/fengari-web/dist/fengari-web.bundle.js",
      ),
    },
    logLevel: "silent",
  });
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(
    require,
    module,
    module.exports,
  );
  const api = module.exports;
  const project = api.resourceRegistry.project.normalize(
    await json(projectFile),
    "base",
  );
  if (!Number.isInteger(project.tileSize) || project.tileSize <= 0)
    throw new Error("The project requires a positive integer tileSize.");
  const prefix = project.idPrefix ?? "base"; // Same supported default as resource normalization in the editor.
  const manifest = api.parseScriptingManifest(await json(bindingsFile));
  const actions = api.getManifestActions(manifest, "cutscene");
  const graphFunctions = api.getManifestGraphFunctions(manifest);
  const schemaFiles = [
    ...new Set([
      path.join(editor, "schemas/cutscene.schema.json"),
      path.join(projectRoot, "schemas/cutscene.schema.json"),
    ]),
  ];
  const schemas = await Promise.all(schemaFiles.map(json));

  async function resources(kind) {
    const definition = api.resourceRegistry[kind];
    let candidates = await files(path.join(projectRoot, definition.folder));
    let entries = candidates.filter(
      (file) =>
        api.getResourceDefinition(definition.folder, path.basename(file))
          ?.kind === kind,
    );
    if (!entries.length && kind === "character") {
      const legacy = definition.legacyFiles[0];
      candidates = await files(path.join(projectRoot, legacy.folder));
      entries = candidates.filter((file) => file.endsWith(legacy.extension));
    }
    const docs = await Promise.all(
      entries.map(async (file) => ({
        file,
        document: definition.normalize(await json(file), prefix),
      })),
    );
    const ids = new Set();
    for (const { file, document } of docs) {
      if (!document.id || ids.has(document.id))
        throw new Error(`Missing or duplicate ${kind} ID in ${file}`);
      ids.add(document.id);
    }
    return docs;
  }
  const [mapEntries, entityEntries, characterEntries, dialogueEntries] =
    await Promise.all([
      resources("location"),
      resources("entity"),
      resources("character"),
      resources("dialogue"),
    ]);
  const maps = mapEntries.map((entry) => entry.document);
  const entityTypes = entityEntries.length
    ? entityEntries.map((entry) => entry.document)
    : (project.entityTypes ?? []);
  const characters = characterEntries.map((entry) => entry.document);
  const refs = {
    maps,
    entityTypes,
    dialogueIds: dialogueEntries.map((entry) => entry.document.id),
    resources: api.withProjectCharacters(manifest.resources, characters),
    tileSize: project.tileSize,
    storyValues: project.storyValues,
    graphFunctions,
  };

  if (command === "inspect") {
    const query = (options.query ?? "").toLowerCase();
    const match = (entry) =>
      !query || JSON.stringify(entry).toLowerCase().includes(query);
    const selectedMaps = maps.filter(
      (map) => !options.map || map.id === options.map,
    );
    if (options.map && !selectedMaps.length)
      throw new Error(`Unknown map ${options.map}`);
    console.log(
      JSON.stringify(
        {
          project: {
            file: projectFile,
            id: project.id,
            prefix,
            tileSize: project.tileSize,
          },
          bindings: bindingsFile,
          schemas: schemaFiles,
          actions: actions.filter(match),
          pureFunctions: graphFunctions.filter(match),
          maps: selectedMaps.map((map) => ({
            file: mapEntries.find((entry) => entry.document.id === map.id).file,
            id: map.id,
            name: map.name,
            width: map.width,
            height: map.height,
            actors: [
              { id: "player", runtimePosition: true },
              ...api.mapCharacterInstances(map, entityTypes),
            ],
            spatialPrimitives: map.spatialPrimitives,
          })),
          resources: refs.resources,
          dialogues: dialogueEntries.map((entry) => ({
            id: entry.document.id,
            file: entry.file,
          })),
          storyValues: project.storyValues ?? [],
          cutscenes: await Promise.all(
            (await files(path.join(projectRoot, "cutscenes")))
              .filter((file) =>
                file.endsWith(api.resourceRegistry.cutscene.extension),
              )
              .map(async (file) => ({ file, id: (await json(file)).id })),
          ),
        },
        null,
        2,
      ),
    );
    return;
  }

  const sceneFile = path.resolve(options.scene);
  const raw = await json(sceneFile);
  const diagnostics = [];
  for (let i = 0; i < schemas.length; i++) {
    const ajv = new Ajv({
      allErrors: true,
      strict: false,
      validateFormats: false,
    });
    const validate = ajv.compile(schemas[i]);
    if (!validate(raw))
      diagnostics.push(
        ...validate.errors.map((error) => ({
          schema: schemaFiles[i],
          ...error,
        })),
      );
  }
  if (!diagnostics.length) {
    const scene = api.parseCutscene(raw);
    diagnostics.push(...api.validateCutscene(scene, actions, refs));
    for (const file of (
      await files(path.join(projectRoot, "cutscenes"))
    ).filter((file) =>
      file.endsWith(api.resourceRegistry.cutscene.extension),
    )) {
      if (
        path.resolve(file).toLowerCase() !== sceneFile.toLowerCase() &&
        (await json(file)).id === scene.id
      )
        diagnostics.push({
          message: `Cutscene ID ${scene.id} is already used by ${file}`,
        });
    }
    if (!diagnostics.length) api.exportCutscene(scene, actions, refs);
  }
  console.log(
    JSON.stringify(
      {
        valid: diagnostics.length === 0,
        source: sceneFile,
        bindings: bindingsFile,
        schemas: schemaFiles,
        suggestedFilename: api.resourceFilename("cutscene", raw.id, prefix),
        diagnostics,
      },
      null,
      2,
    ),
  );
  if (diagnostics.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
