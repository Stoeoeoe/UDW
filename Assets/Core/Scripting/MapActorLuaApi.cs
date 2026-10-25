using System;
using System.Collections.Generic;
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
    [LuaModule("Actors")]
    public sealed class MapActorLuaApi
    {
        private readonly VulcanusImportedMap _map;
        private readonly Dictionary<string, GameCharacter> _actors = new(StringComparer.Ordinal);
        private readonly Dictionary<string, VulcanusMapAnchor> _anchors = new(StringComparer.OrdinalIgnoreCase);

        /// <summary>Finds the actors and anchors in the loaded map and remembers their IDs.</summary>
        public static MapActorLuaApi BindCurrentMap()
        {
            if (!LevelManager.Instance.SceneReady)
                throw new InvalidOperationException("Bind actor actions after the location is SceneReady.");
            if (!MapManager.Instance.CurrentMap)
                throw new InvalidOperationException("Actor actions require the initialized Vulcanus map.");
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
                    throw new InvalidOperationException("Actor bindings require bound live spawn instances, not import templates.");
                var characters = instance.GetComponentsInChildren<GameCharacter>(true);
                if (characters.Length == 0) continue; // Skip objects without characters, such as chests.
                if (characters.Length != 1)
                    throw new InvalidOperationException($"Spawn instance '{instance.PersistentId}' must identify exactly one actor.");
                AddActor(instance.PersistentId, characters[0]);
            }
        }

        private void AddActor(string id, GameCharacter actor)
        {
            if (!actor || !actor.isActiveAndEnabled || !actor.IsRuntimeInitialized)
                throw new InvalidOperationException($"Actor '{id}' requires its live initialized character.");
            if (!_actors.TryAdd(id, actor))
                throw new InvalidOperationException($"Duplicate actor instance ID '{id}', including the reserved 'player' role.");
        }

        /// <summary>Checks both IDs before a cutscene starts. Does not move anything.</summary>
        [UnityEngine.Scripting.Preserve]
        public void ValidateMoveTo(string actor, string destination)
        {
            RequireCurrentMap();
            ResolveActor(actor);
            ResolveAnchor(destination);
        }

        /// <summary>Finds the character and anchor, then starts walking to the anchor's world position.</summary>
        [LuaAction("actors.moveTo", "Move to anchor", "Movement", "Walk an existing actor to a map anchor.", "cutscene", "npcRoutine", Validator = nameof(ValidateMoveTo), Phases = new[] { "sequence" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        [LuaPreviewEffect(0, LuaPreviewEffectKind.MoveActorToAnchor, ActorParameter = "actor", AnchorParameter = "destination", Facing = "unknown")]
        public ILuaAction MoveTo([LuaReference("actorRef", "mapActor")] string actor,
            [LuaReference("anchorRef", "mapAnchor")] string destination)
        {
            RequireCurrentMap();
            return new MoveToAction(ResolveActor(actor), ResolveAnchor(destination).transform.position);
        }

        /// <summary>Checks both actor IDs before a cutscene starts. Does not turn either actor.</summary>
        [UnityEngine.Scripting.Preserve]
        public void ValidateFace(string actor, string target) => ResolveFacingActors(actor, target);

        /// <summary>Turns one character toward another. Completes immediately.</summary>
        [LuaAction("actors.face", "Face actor", "Movement", "Turn an existing actor toward another actor.", "cutscene", "npcRoutine", Validator = nameof(ValidateFace), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        [LuaPreviewEffect(0, LuaPreviewEffectKind.FaceActorTowardActor, ActorParameter = "actor", TargetActorParameter = "target")]
        public void Face([LuaReference("actorRef", "mapActor")] string actor,
            [LuaReference("actorRef", "mapActor")] string target)
        {
            var (character, targetCharacter) = ResolveFacingActors(actor, target);
            character.Orientation.FaceTowards(targetCharacter.transform.position);
        }

        private (GameCharacter Actor, GameCharacter Target) ResolveFacingActors(string actor, string target)
        {
            RequireCurrentMap();
            var character = ResolveActor(actor);
            var targetCharacter = ResolveActor(target);
            if (character == targetCharacter)
                throw new InvalidOperationException("An actor cannot face itself.");
            return (character, targetCharacter);
        }

        [UnityEngine.Scripting.Preserve]
        public void ValidatePlayAnimation(string actor, string animation)
        {
            RequireCurrentMap();
            ResolveActor(actor).Animator.ValidateOneShot(CharacterAnimationCatalog.RequireOneShot(animation));
        }

        [LuaAction("actors.playAnimation", "Play animation", "Animation", "Play a finite animation on an actor and wait for completion.",
            "cutscene", Validator = nameof(ValidatePlayAnimation), Phases = new[] { "sequence" })]
        [LuaPreview(LuaPreviewSpatialState.Unknown)]
        public ILuaAction PlayAnimation([LuaReference("actorRef", "mapActor")] string actor,
            [LuaResource("animation")] string animation)
        {
            RequireCurrentMap();
            return new PlayAnimationAction(ResolveActor(actor), CharacterAnimationCatalog.RequireOneShot(animation));
        }

        private void RequireCurrentMap()
        {
            // These lookups are for one map. Don't use them while changing maps.
            if (!LevelManager.Instance.SceneReady || MapManager.Instance.CurrentMap != _map)
                throw new InvalidOperationException("Actor bindings no longer belong to the ready current map.");
        }

        internal GameCharacter ResolveActor(string id)
        {
            if (!_actors.TryGetValue(id, out var actor))
                throw new InvalidOperationException($"Map '{_map.MapId}' has no bound actor instance '{id}'.");
            if (!actor || !actor.isActiveAndEnabled)
                throw new InvalidOperationException($"Bound actor '{id}' has left the live world.");
            return actor;
        }

        internal VulcanusMapAnchor ResolveAnchor(string id)
        {
            if (!_anchors.TryGetValue(id, out var anchor))
                throw new InvalidOperationException($"Map '{_map.MapId}' has no anchor '{id}'.");
            if (!anchor) throw new InvalidOperationException($"Bound anchor '{id}' was destroyed.");
            return anchor;
        }
    }
}
