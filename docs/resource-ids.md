# Resource IDs

Projects define `idPrefix` in their `.vproj` manifest. New projects default to
`base`; manifests without the field also use `base`. Set a different prefix when
creating a mod project. The prefix is fixed after creation because changing it
would change resource identities and invalidate references from other projects.

Actors, entities, items, maps, tilesets and dialogues use lowercase qualified IDs
in editor state and serialized files: `<idPrefix>:<localId>`. For example,
`myActor` in a legacy base project becomes `base:myactor`. References to these
resources use the same complete ID, including references across namespaces such
as a mod dialogue's `speaker: "base:myactor"`.

IDs within a resource (dialogue nodes/options, map layers/instances/anchors,
tileset object definitions) and project-contained definitions remain local and
lowercase. The project manifest's own ID remains a lowercase local bundle ID.
Lua variable names, display names, paths, prose, and localization message keys
keep their original casing.

On load, the editor normalizes legacy resource IDs and declared reference fields,
preserving already-qualified namespaces. It rejects collisions introduced by
lowercasing instead of silently dropping resources. Saving writes the qualified
IDs back to the original files; opening a project does not rewrite its files.
ID literals embedded in Lua or arbitrary custom property values are authored
content and must be updated by their author; they are not rewritten as strings.

Logical IDs are separate from physical filenames because Windows forbids `:`.
New files use the local ID within their own namespace (`myactor.actor.json`), or
`<namespace>~<localId>` for foreign namespaces. Windows-reserved names receive a
leading `~`. Existing filenames, including their casing, are retained on save,
read, delete, and reveal in Explorer. Dialogue companion exports share the
source document's filename stem.

Tile reference strings use `<qualifiedTilesetId>:<tileIndex>` (for example,
`base:terrain:12`) and split at the final colon. Encoded map tile data continues
to index the map's `tilesetRefs` array, whose entries are now qualified IDs.

## Central resource registry

`app/src/lib/resourceRegistry.ts` is the shared source for each document's kind,
directory, file extension, schema filename, ID scope, legacy file formats and
source/companion relationships. It also owns a typed normalizer for each document
structure. The project supplies the prefix; resource definitions apply it to
resource IDs and references while keeping local IDs local.

Electron, file persistence, serializers, file lookup and the existing editor
resource registry use these definitions. The registry imports no schemas, stores
or browser APIs. JSON schemas validate the serialized format and contain no
editor behavior annotations.

For example, the actor entry ties `actors/`, `.actor.json`, `actor.schema.json`,
resource ID scope and legacy `npcs/*.npc.json` support together. Dialogue source,
runtime and localization exports have separate entries linked by `sourceKind`.
Original-file lookup uses a logical file key; physical filenames remain Windows
compatible and preserve existing filenames after migration.

To add a resource, add its document type and one registry entry with storage
details and a typed normalizer, then attach the editor behavior in
`editorResourceTypes.ts`. To add a reference, update its owning typed normalizer
and the format schema. No global field-name list or schema annotations are used.
