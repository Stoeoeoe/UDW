using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using Character;
using Character.Animations;
using Core.Location;
using Core.Spawning;
using Core.Tile;
using Core.Tile.Vulcanus;

namespace Core.Scripting
{
    /// <summary>Lets Lua move and turn characters in the current map.</summary>
    /// <remarks>Create this for each run after the map finishes loading. Use "player" for the player and spawned-object IDs for NPCs.</remarks>
    [LuaModule("Characters")]
    public sealed class MapActorLuaApi
    {
        private readonly VulcanusImportedMap _map;
        private readonly Dictionary<string, GameCharacter> _actors = new(StringComparer.Ordinal);
        private readonly Dictionary<string, VulcanusMapAnchor> _anchors = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, SpawnedObject> _plannedActors = new(StringComparer.Ordinal);
        private readonly List<SpawnedObject> _createdActors = new();
        private CutsceneRun _run;

        internal void BeginRun(CutsceneRun run) => _run = run;
        internal bool IsPlanned(string character) => _plannedActors.ContainsKey(character);

        internal GameCharacter RequireKnownActor(string id)
        {
            if (_plannedActors.TryGetValue(id, out var prefab)) return prefab.GetComponentInChildren<GameCharacter>(true);
            return ResolveActor(id);
        }

        internal void FinishSpawns(bool keep)
        {
            foreach (var spawn in _createdActors)
                if (keep) spawn.SavePosition();
                else WorldObjectSpawner.Instance.Despawn(spawn.PersistentId);
            _createdActors.Clear();
        }

        [UnityEngine.Scripting.Preserve]
        public void ValidateSpawn(string character, string definition, MapPosition position)
        {
            RequireCurrentMap();
            if (string.IsNullOrWhiteSpace(character) || _actors.ContainsKey(character) || _plannedActors.ContainsKey(character))
                throw new InvalidOperationException($"Spawn character name '{character}' must be nonempty and unique in this cutscene/map.");
            CharacterCatalog.Require(definition);
            var prefabs = ActorSpawnDefinitions.Find(WorldObjectSpawner.Instance.RegisteredPrefabs);
            if (!prefabs.TryGetValue(definition, out var prefab))
                throw new InvalidOperationException($"Character '{definition}' has no registered spawnable NPC prefab.");
            position.ToWorld(_map);
            _plannedActors.Add(character, prefab);
        }

        [LuaAction("characters.spawn", "Spawn character", "Placement", "Spawn a persistent NPC and declare its cutscene-local character name.",
            "cutscene", Validator = nameof(ValidateSpawn), Phases = new[] { "setup" })]
        [LuaPreview(LuaPreviewSpatialState.Described, Version = 2)]
        [LuaPreviewEffect(0, LuaPreviewEffectKind.SpawnCharacter, CharacterParameter = "character", DefinitionParameter = "definition", PositionParameter = "position", Facing = "unknown")]
        public void Spawn([LuaCharacterDeclaration] string character, [LuaResource("character")] string definition, [LuaPosition] MapPosition position)
        {
            RequireCurrentMap();
            if (_run == null) throw new InvalidOperationException("Spawn character requires its bound cutscene run.");
            var prefab = _plannedActors[character];
            var template = prefab.GetComponentInChildren<GameCharacter>(true);
            if (template.CharacterId != definition) throw new InvalidOperationException("Spawn must use its prevalidated character definition.");
            var point = position.ToWorld(_map);
            var instance = WorldObjectSpawner.Instance.Spawn(prefab, point - (template.Graphics.position - prefab.transform.position));
            _createdActors.Add(instance); // Cleanup also owns failures during character initialization below.
            var spawnedCharacter = instance.GetComponentInChildren<GameCharacter>(true);
            LevelManager.Instance.RegisterLifecycle(spawnedCharacter);
            AddActor(character, spawnedCharacter);
            Place(character, position);
            _run.AddSpawnedActor(this, character);
        }

        /// <summary>Finds the characters and anchors in the loaded map and remembers their IDs.</summary>
        public static MapActorLuaApi BindCurrentMap()
        {
            if (!LevelManager.Instance.SceneReady)
                throw new InvalidOperationException("Bind character actions after the location is SceneReady.");
            if (!MapManager.Instance.CurrentMap)
                throw new InvalidOperationException("Character actions require the initialized Vulcanus map.");
            return new MapActorLuaApi(MapManager.Instance.CurrentMap, MainCharacter.CurrentMainCharacter,
                WorldObjectSpawner.Instance.SpawnedObjects);
        }

        private MapActorLuaApi(VulcanusImportedMap map, GameCharacter player,
            IEnumerable<SpawnedObject> spawnedObjects)
        {
            _map = map;
            // The player is created separately from the other spawned objects.
            AddActor("player", player);

            // Lua uses these IDs to choose where a character should walk.
            foreach (var anchor in map.GetComponentsInChildren<VulcanusMapAnchor>(true))
            {
                if (string.IsNullOrWhiteSpace(anchor.AnchorId))
                    throw new InvalidOperationException($"Map '{map.MapId}' has an anchor without an ID.");
                if (!_anchors.TryAdd(anchor.AnchorId, anchor))
                    throw new InvalidOperationException($"Map '{map.MapId}' has duplicate anchor ID '{anchor.AnchorId}'.");
                var position = anchor.transform.position;
                if (!float.IsFinite(position.x) || !float.IsFinite(position.y))
                    throw new InvalidOperationException($"Anchor '{anchor.AnchorId}' requires a finite world position.");
            }

            // NPCs use their spawned object's ID, not their name or character definition ID.
            foreach (var instance in spawnedObjects)
            {
                if (!instance || instance.State == null || string.IsNullOrWhiteSpace(instance.PersistentId))
                    throw new InvalidOperationException("Character bindings require bound live spawn instances, not import templates.");
                var characters = instance.GetComponentsInChildren<GameCharacter>(true);
                if (characters.Length == 0) continue; // Skip objects without characters, such as chests.
                if (characters.Length != 1)
                    throw new InvalidOperationException($"Spawn instance '{instance.PersistentId}' must identify exactly one character.");
                AddActor(instance.PersistentId, characters[0]);
            }
        }

        private void AddActor(string id, GameCharacter character)
        {
            if (!character || !character.isActiveAndEnabled || !character.IsRuntimeInitialized)
                throw new InvalidOperationException($"Character '{id}' requires its live initialized character.");
            if (!_actors.TryAdd(id, character))
                throw new InvalidOperationException($"Duplicate character instance ID '{id}', including the reserved 'player' role.");
        }

        /// <summary>Checks both IDs before a cutscene starts. Does not move anything.</summary>
        [UnityEngine.Scripting.Preserve]
        public void ValidateMoveTo(string character, string destination)
        {
            RequireCurrentMap();
            RequireKnownActor(character);
            ResolveAnchor(destination);
        }

        /// <summary>Finds the character and anchor, then starts walking to the anchor's world position.</summary>
        [LuaAction("characters.moveTo", "Move to anchor", "Movement", "Walk an existing character to a map anchor.", "cutscene", "npcRoutine", Validator = nameof(ValidateMoveTo), Phases = new[] { "sequence" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        [LuaPreviewEffect(0, LuaPreviewEffectKind.MoveCharacterToAnchor, CharacterParameter = "character", AnchorParameter = "destination", Facing = "unknown")]
        public ILuaAction MoveTo([LuaReference("characterRef", "mapCharacter")] string character,
            [LuaReference("anchorRef", "mapAnchor")] string destination)
        {
            RequireCurrentMap();
            return new MoveToAction(ResolveActor(character), ResolveAnchor(destination).transform.position);
        }

        [UnityEngine.Scripting.Preserve]
        public void ValidateWalkPath(string character, MapPath path)
        {
            RequireCurrentMap();
            RequireKnownActor(character);
            if (path == null) throw new ArgumentNullException(nameof(path));
            path.ToWorld(_map); // Resolve every point before starting any movement.
        }

        [LuaAction("characters.walkPath", "Walk path", "Movement", "Walk through an ordered list of map positions and anchors.",
            "cutscene", "npcRoutine", Validator = nameof(ValidateWalkPath), Phases = new[] { "sequence" })]
        [LuaPreview(LuaPreviewSpatialState.Described, Version = 2)]
        [LuaPreviewEffect(0, LuaPreviewEffectKind.MoveCharacterAlongPath, CharacterParameter = "character", PathParameter = "path", Facing = "unknown")]
        public ILuaAction WalkPath([LuaReference("characterRef", "mapCharacter")] string character, [LuaPath] MapPath path)
        {
            RequireCurrentMap();
            var walker = ResolveActor(character);
            var points = path.ToWorld(_map);
            var feetOffset = (Vector2)(walker.Graphics.position - walker.transform.position);
            for (var i = 0; i < points.Length; i++) points[i] -= feetOffset;
            return new WalkPathAction(walker, points);
        }

        /// <summary>Checks both character IDs before a cutscene starts. Does not turn either character.</summary>
        [UnityEngine.Scripting.Preserve]
        public void ValidateFace(string character, string target)
        {
            RequireCurrentMap();
            RequireKnownActor(character);
            RequireKnownActor(target);
            if (character == target) throw new InvalidOperationException("A character cannot face itself.");
        }

        /// <summary>Turns one character toward another. Completes immediately.</summary>
        [LuaAction("characters.face", "Face character", "Movement", "Turn an existing character toward another character.", "cutscene", "npcRoutine", Validator = nameof(ValidateFace), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        [LuaPreviewEffect(0, LuaPreviewEffectKind.FaceCharacterTowardCharacter, CharacterParameter = "character", TargetCharacterParameter = "target")]
        public void Face([LuaReference("characterRef", "mapCharacter")] string character,
            [LuaReference("characterRef", "mapCharacter")] string target)
        {
            var (sourceCharacter, targetCharacter) = ResolveFacingActors(character, target);
            sourceCharacter.Orientation.FaceTowards(targetCharacter.transform.position);
        }

        private (GameCharacter Character, GameCharacter Target) ResolveFacingActors(string character, string target)
        {
            RequireCurrentMap();
            var sourceCharacter = ResolveActor(character);
            var targetCharacter = ResolveActor(target);
            if (sourceCharacter == targetCharacter)
                throw new InvalidOperationException("A character cannot face itself.");
            return (sourceCharacter, targetCharacter);
        }

        [UnityEngine.Scripting.Preserve]
        public void ValidateFaceDirection(string character, string direction)
        {
            RequireCurrentMap();
            RequireKnownActor(character);
            CardinalDirections.Resolve(direction);
        }

        [LuaAction("characters.faceDirection", "Face direction", "Movement", "Turn a character toward North, East, South or West.",
            "cutscene", "npcRoutine", Validator = nameof(ValidateFaceDirection), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        [LuaPreviewEffect(0, LuaPreviewEffectKind.FaceCharacterDirection, CharacterParameter = "character", DirectionParameter = "direction")]
        public void FaceDirection([LuaReference("characterRef", "mapCharacter")] string character,
            [LuaResource("direction")] string direction)
        {
            RequireCurrentMap();
            ResolveActor(character).Orientation.ForceDirection(CardinalDirections.Resolve(direction));
        }

        [UnityEngine.Scripting.Preserve]
        public void ValidatePlace(string character, MapPosition position)
        {
            RequireCurrentMap();
            RequireKnownActor(character);
            position.ToWorld(_map);
        }

        [LuaAction("characters.place", "Place character", "Placement", "Immediately place a character at a map position.",
            "cutscene", Validator = nameof(ValidatePlace), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described, Version = 2)]
        [LuaPreviewEffect(0, LuaPreviewEffectKind.SetCharacterPosition, CharacterParameter = "character", PositionParameter = "position", Facing = "preserve")]
        public void Place([LuaReference("characterRef", "mapCharacter")] string character, [LuaPosition] MapPosition position)
        {
            RequireCurrentMap();
            var placedCharacter = ResolveActor(character);
            var point = position.ToWorld(_map);
            var spawn = placedCharacter.GetComponentInParent<SpawnedObject>();
            var root = spawn ? spawn.transform : placedCharacter.transform;
            placedCharacter.Controller.Stop();
            // CharacterGraphics' authored sprite pivot is the feet/ground origin, not the Rigidbody's origin.
            root.position += point - placedCharacter.Graphics.position;
            placedCharacter.GetComponent<UnityEngine.Rigidbody2D>().position = placedCharacter.transform.position;
            placedCharacter.SetMovementState(MovementState.Idle);
            placedCharacter.Tiles.OnPlaced();
            if (spawn) spawn.SavePosition();
        }

        [UnityEngine.Scripting.Preserve]
        public void ValidatePlayAnimation(string character, string animation)
        {
            RequireCurrentMap();
            RequireKnownActor(character).Animator.ValidateOneShot(CharacterAnimationCatalog.RequireOneShot(animation));
        }

        [LuaAction("characters.playAnimation", "Play animation", "Animation", "Play a finite animation on a character and wait for completion.",
            "cutscene", Validator = nameof(ValidatePlayAnimation), Phases = new[] { "sequence" })]
        [LuaPreview(LuaPreviewSpatialState.Unknown)]
        public ILuaAction PlayAnimation([LuaReference("characterRef", "mapCharacter")] string character,
            [LuaResource("animation")] string animation)
        {
            RequireCurrentMap();
            return new PlayAnimationAction(ResolveActor(character), CharacterAnimationCatalog.RequireOneShot(animation));
        }

        private void RequireCurrentMap()
        {
            // These lookups are for one map. Don't use them while changing maps.
            if (!LevelManager.Instance.SceneReady || MapManager.Instance.CurrentMap != _map)
                throw new InvalidOperationException("Character bindings no longer belong to the ready current map.");
        }

        internal GameCharacter ResolveActor(string id)
        {
            if (!_actors.TryGetValue(id, out var character))
                throw new InvalidOperationException($"Map '{_map.MapId}' has no bound character instance '{id}'.");
            if (!character || !character.isActiveAndEnabled)
                throw new InvalidOperationException($"Bound character '{id}' has left the live world.");
            return character;
        }

        internal UnityEngine.Vector3 ResolvePosition(MapPosition position) => position.ToWorld(_map);

        internal VulcanusMapAnchor ResolveAnchor(string id)
        {
            if (!_anchors.TryGetValue(id, out var anchor))
                throw new InvalidOperationException($"Map '{_map.MapId}' has no anchor '{id}'.");
            if (!anchor) throw new InvalidOperationException($"Bound anchor '{id}' was destroyed.");
            return anchor;
        }
    }
}
