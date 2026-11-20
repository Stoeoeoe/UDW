using System;
using System.Collections.Generic;
using System.Linq;
using Core.Location;
using UnityEngine;

namespace Core.Tile.Vulcanus
{
    /// <summary>A location link as a one-way way between maps: from a trigger on one map to an arrival anchor on another.</summary>
    public sealed class MapLink
    {
        public string FromMapId { get; }
        public string ToMapId { get; }
        public string ArrivalAnchorId { get; }
        /// <summary>The trigger's bounds in the local space of its map, where characters use the link.</summary>
        public Rect TriggerArea { get; }

        public MapLink(string fromMapId, string toMapId, string arrivalAnchorId, Rect triggerArea)
        {
            FromMapId = fromMapId;
            ToMapId = toMapId;
            ArrivalAnchorId = arrivalAnchorId;
            TriggerArea = triggerArea;
        }
    }

    /// <summary>
    /// The world's maps joined by their location links, the only way characters get from one map to another. Built
    /// from the imported map prefabs, so it is the same in the editor and at runtime. Mirrors Vulcanus lib/worldGraph.ts.
    /// </summary>
    public sealed class MapLinkGraph
    {
        private readonly Dictionary<string, List<MapLink>> _linksFrom = new(StringComparer.Ordinal);

        public MapLinkGraph(IEnumerable<MapLink> links)
        {
            foreach (var link in links)
            {
                if (!_linksFrom.TryGetValue(link.FromMapId, out var list)) _linksFrom[link.FromMapId] = list = new List<MapLink>();
                list.Add(link);
            }
        }

        /// <summary>Every location link of every map bound in the world catalogs.</summary>
        public static MapLinkGraph Build(IEnumerable<VulcanusWorldCatalog> worlds) =>
            new(worlds.SelectMany(world => world.MapBindings)
                .Where(binding => binding.MapPrefab)
                .SelectMany(binding => binding.MapPrefab.GetComponentsInChildren<LocationLink>(true)
                    .Select(link => new MapLink(binding.MapId, link.TargetLocationId, link.TargetEntryKey,
                        TriggerArea(binding.MapPrefab.transform, link)))));

        /// <summary>The bounds of the link's trigger collider in the map's local space; works on prefab assets.</summary>
        private static Rect TriggerArea(Transform map, LocationLink link)
        {
            Vector2[] corners = link.GetComponent<Collider2D>() switch
            {
                BoxCollider2D box => new[] { box.offset - box.size / 2, box.offset + box.size / 2 },
                PolygonCollider2D polygon => polygon.points.Select(point => point + polygon.offset).ToArray(),
                var other => throw new InvalidOperationException(
                    $"Location link '{link.Key}' needs a box or polygon trigger, not {other?.GetType().Name ?? "none"}.")
            };
            var local = corners.Select(corner => (Vector2)map.InverseTransformPoint(link.transform.TransformPoint(corner))).ToArray();
            var min = local.Aggregate(Vector2.Min);
            var max = local.Aggregate(Vector2.Max);
            return Rect.MinMaxRect(min.x, min.y, max.x, max.y);
        }

        public IReadOnlyList<MapLink> LinksFrom(string mapId) =>
            _linksFrom.TryGetValue(mapId, out var links) ? links : Array.Empty<MapLink>();

        /// <summary>Whether a chain of links leads from one map to the other; a map always reaches itself.</summary>
        public bool CanReach(string fromMapId, string toMapId)
        {
            var seen = new HashSet<string>(StringComparer.Ordinal) { fromMapId };
            var queue = new Queue<string>(seen);
            while (queue.Count > 0)
            {
                var map = queue.Dequeue();
                if (map == toMapId) return true;
                foreach (var link in LinksFrom(map))
                    if (seen.Add(link.ToMapId)) queue.Enqueue(link.ToMapId);
            }
            return false;
        }
    }
}
