# Character terminology and contract rename

The editor now uses Character/Characters in its UI, code, resource files, and
scripting metadata. This is a breaking rename. Existing character resources will
be recreated; there is no migration for actor resources or metadata.

Unity must export and consume the matching names:

| Previous name | New name |
| --- | --- |
| `actors/`, `.actor.json`, `actor.schema.json` | `characters/`, `.character.json`, `character.schema.json` |
| Lua module `Actors`, action prefix `actors.*` | `Characters`, `characters.*` |
| `resources.actor` | `resources.character` |
| `actorRef`, `actorDeclaration`, `mapActor` | `characterRef`, `characterDeclaration`, `mapCharacter` |
| Argument `actor` | `character` |
| Position metadata `actorPivot` | `characterPivot` |
| Preview `actorParameter`, `targetActorParameter` | `characterParameter`, `targetCharacterParameter` |
| `spawnActor`, `setActorPosition` | `spawnCharacter`, `setCharacterPosition` |
| `moveActorToAnchor`, `faceActorTowardActor`, `faceActorDirection` | `moveCharacterToAnchor`, `faceCharacterTowardCharacter`, `faceCharacterDirection` |
| `onComplete.actorPlacements` and its `actor` field | `onComplete.characterPlacements` and its `character` field |

Parameter names remain mapped through metadata; the editor does not hardcode
individual scripting action IDs. Source and manifest format versions remain 2;
preview metadata continues to support versions 1 and 2 with the renamed effects.
Reserved `player`, cutscene phases, positions, and resource IDs otherwise keep
their meanings.

The editor gets character definitions from its project. It does not require them
to appear in Unity's exported resource catalog. Unity resolves character IDs to
runtime prefabs and reports any prefab availability errors there.
