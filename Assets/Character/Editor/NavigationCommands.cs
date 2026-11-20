using System;
using System.Linq;
using Core.Tile;
using Unity.Pipeline.Commands;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Character.Editor
{
    /// <summary>Dev-only Play mode command that sends a character to an anchor via <see cref="CharacterNavigation.NavigateTo"/>.</summary>
    [InitializeOnLoad]
    public static class NavigationCommands
    {
        private static NavigationRoute _route;
        private static MapManager _maps;
        private static Core.Tile.Vulcanus.VulcanusImportedMap _planningMap;
        private static string _label;

        static NavigationCommands()
        {
            // The route needs a ticker; nothing in gameplay owns routes yet, so this dev host does, and only in Play mode.
            EditorApplication.update += Tick;
            EditorApplication.playModeStateChanged += _ => Stop();
        }

        [CliCommand("navigate_to", "Send a character in the current map to an anchor with tile pathfinding; returns the planned waypoints and cost", MainThreadRequired = true)]
        public static object NavigateTo(
            [CliArg("characterId", "Character ID of a character in the current map", Required = true)] string characterId,
            [CliArg("anchorId", "Anchor ID in the current map", Required = true)] string anchorId)
        {
            if (!EditorApplication.isPlaying)
                throw new InvalidOperationException("Start the game in Play mode before using navigate_to.");
            var maps = Object.FindFirstObjectByType<MapManager>();
            if (!maps || !maps.CurrentMap) throw new InvalidOperationException("No location map is loaded.");
            var characters = Object.FindObjectsByType<GameCharacter>(FindObjectsSortMode.None);
            var character = characters.FirstOrDefault(candidate =>
                candidate.CharacterId == characterId);
            if (!character)
                throw new ArgumentException($"No character '{characterId}' in the current map. Present: " +
                    string.Join(", ", characters.Select(candidate => candidate.CharacterId)));
            if (!maps.TryGetAnchor(anchorId, out var anchor))
                throw new ArgumentException($"No anchor '{anchorId}' in the current map.");

            Stop();
            var destination = (Vector2)anchor.transform.position;
            var route = CharacterNavigation.NavigateTo(character, destination, maps);
            var result = new
            {
                character = character.CharacterId,
                anchor = anchor.AnchorId,
                status = route.Status.ToString(),
                error = route.Error,
                totalCost = route.TotalCost,
                waypoints = route.Waypoints.Select(point => new { x = point.x, y = point.y }).ToArray()
            };
            if (route.Status == NavigationMoveStatus.Moving)
            {
                _route = route;
                _maps = maps;
                _planningMap = maps.CurrentMap;
                _label = $"{character.CharacterId} -> {anchor.AnchorId}";
            }
            return result;
        }

        private static void Tick()
        {
            if (_route == null) return;
            // Stop when the location unloads (a new or missing map) or the route ends.
            if (!_maps || _maps.CurrentMap != _planningMap) { Stop(); return; }
            _route.Tick(Time.deltaTime);
            if (_route.Status == NavigationMoveStatus.Moving) return;
            Debug.Log($"navigate_to {_label}: {_route.Status}" + (_route.Error != null ? $" ({_route.Error})" : ""));
            Stop();
        }

        private static void Stop()
        {
            _route?.Dispose();
            _route = null;
        }
    }
}
