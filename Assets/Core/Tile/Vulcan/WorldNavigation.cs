using System;
using System.Collections.Generic;
using System.Linq;
using Core.Routines;
using Interaction;
using UnityEngine;

namespace Core.Tile.Vulcanus
{
    /// <summary>
    /// What routes on one map are planned from without loading it: the baked navigation grid and the anchors. Positions
    /// are feet positions in the map's local space, where cell (x, y)'s drawn tile has its middle at (x + 0.5, y)
    /// (<see cref="MapManager.TileVisualOffset"/>).
    /// </summary>
    public sealed class NavigationMap
    {
        private readonly IReadOnlyDictionary<string, Vector2> _anchors;
        private readonly IReadOnlyDictionary<string, Vector2> _slotExits;

        public string MapId { get; }
        public NavigationCostGrid Grid { get; }

        /// <param name="slotExits">Where the first interaction slot of each placed entity lets its occupant out, by entity ID.</param>
        public NavigationMap(string mapId, NavigationCostGrid grid, IReadOnlyDictionary<string, Vector2> anchors,
            IReadOnlyDictionary<string, Vector2> slotExits = null)
        {
            MapId = mapId;
            Grid = grid ?? throw new ArgumentNullException(nameof(grid), $"Map '{mapId}' has no baked navigation grid; reimport it.");
            _anchors = new Dictionary<string, Vector2>(anchors, StringComparer.Ordinal);
            _slotExits = new Dictionary<string, Vector2>(slotExits ?? new Dictionary<string, Vector2>(), StringComparer.Ordinal);
        }

        public Vector2 Anchor(string anchorId) =>
            _anchors.TryGetValue(anchorId, out var position)
                ? position
                : throw new InvalidOperationException($"Map '{MapId}' has no anchor '{anchorId}'.");

        /// <summary>Where a character stands for a place: its anchor, or beside the slots of its entity.</summary>
        public Vector2 Position(RoutinePlace place) =>
            !place.IsEntity ? Anchor(place.Anchor)
            : _slotExits.TryGetValue(place.Entity, out var exit)
                ? exit
                : throw new InvalidOperationException($"Map '{MapId}' has no entity '{place.Entity}' with an interaction slot.");

        /// <summary>The cell whose drawn tile contains a local position.</summary>
        public static Vector2Int CellAt(Vector2 position)
        {
            var logical = position - MapManager.TileVisualOffset;
            return new Vector2Int(Mathf.FloorToInt(logical.x), Mathf.FloorToInt(logical.y));
        }

        /// <summary>The middle of a cell's drawn tile.</summary>
        public static Vector2 CellCenter(Vector2Int cell) => new Vector2(cell.x + 0.5f, cell.y + 0.5f) + MapManager.TileVisualOffset;

        /// <summary>
        /// Where characters walk to use a link: the walkable cell nearest the middle of its trigger, among those the
        /// trigger covers or borders. Triggers are often thin strips along a map's edge.
        /// </summary>
        public Vector2 DoorPosition(MapLink link)
        {
            var area = link.TriggerArea;
            var reach = new Rect(area.xMin - 0.5f, area.yMin - 0.5f, area.width + 1f, area.height + 1f);
            var corner = CellAt(reach.min);
            var far = CellAt(reach.max);
            Vector2? best = null;
            for (var y = corner.y; y <= far.y; y++)
                for (var x = corner.x; x <= far.x; x++)
                {
                    var cell = new Vector2Int(x, y);
                    if (!Grid.Contains(cell) || Grid.IsBlocked(cell)) continue;
                    var tile = new Rect(CellCenter(cell) - new Vector2(0.5f, 0.5f), Vector2.one);
                    if (!tile.Overlaps(reach)) continue;
                    var centre = CellCenter(cell);
                    if (best == null || (centre - area.center).sqrMagnitude < (best.Value - area.center).sqrMagnitude) best = centre;
                }
            return best ?? throw new InvalidOperationException(
                $"Map '{MapId}': no walkable tile at the trigger of the link to '{link.ToMapId}' ({area}).");
        }
    }

    /// <summary>Every map of the world as <see cref="NavigationMap"/>s, joined by their location links.</summary>
    public sealed class WorldNavigation
    {
        private readonly Dictionary<string, NavigationMap> _maps;

        public MapLinkGraph Links { get; }

        public WorldNavigation(IEnumerable<NavigationMap> maps, MapLinkGraph links)
        {
            _maps = maps.ToDictionary(map => map.MapId, StringComparer.Ordinal);
            Links = links;
        }

        public NavigationMap Map(string mapId) =>
            _maps.TryGetValue(mapId, out var map) ? map : throw new InvalidOperationException($"No map '{mapId}' in the world.");

        /// <summary>Reads every map bound in the world catalogs from its imported prefab.</summary>
        public static WorldNavigation Build(IReadOnlyCollection<VulcanusWorldCatalog> worlds)
        {
            var maps = worlds.SelectMany(world => world.MapBindings)
                .Where(binding => binding.MapPrefab)
                .Select(binding =>
                {
                    var root = binding.MapPrefab.transform;
                    var anchors = binding.MapPrefab.GetComponentsInChildren<VulcanusMapAnchor>(true)
                        .ToDictionary(anchor => anchor.AnchorId, anchor => (Vector2)root.InverseTransformPoint(anchor.transform.position),
                            StringComparer.Ordinal);
                    var grid = binding.MapPrefab.GetComponentInChildren<VulcanusImportedMap>(true).NavigationCosts;
                    var slotExits = binding.MapPrefab.GetComponentsInChildren<VulcanusMapEntity>(true)
                        .Select(entity => (entity.EntityId, Slot: entity.GetComponentInChildren<InteractionSlot>(true)))
                        .Where(entity => entity.Slot)
                        .ToDictionary(entity => entity.EntityId, entity => (Vector2)root.InverseTransformPoint(entity.Slot.ExitPoint.position),
                            StringComparer.Ordinal);
                    return new NavigationMap(binding.MapId, grid, anchors, slotExits);
                });
            return new WorldNavigation(maps, MapLinkGraph.Build(worlds));
        }
    }
}
