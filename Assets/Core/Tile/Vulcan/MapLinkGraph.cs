using System;
using System.Collections.Generic;
using System.Linq;
using Core.Location;

namespace Core.Tile.Vulcanus
{
    /// <summary>A location link as a one-way way between maps: from a trigger on one map to an arrival anchor on another.</summary>
    public sealed class MapLink
    {
        public string FromMapId { get; }
        public string ToMapId { get; }
        public string ArrivalAnchorId { get; }

        public MapLink(string fromMapId, string toMapId, string arrivalAnchorId)
        {
            FromMapId = fromMapId;
            ToMapId = toMapId;
            ArrivalAnchorId = arrivalAnchorId;
        }
    }

    /// <summary>
    /// The world's maps joined by their location links, the only way characters get from one map to another. Built
    /// from the imported map prefabs, so it is the same in the editor and at runtime. Mirrors Vulcanus lib/worldGraph.ts.
    /// </summary>
    public sealed class MapLinkGraph
    {
        private readonly Dictionary<string, List<MapLink>> _linksFrom = new(StringComparer.OrdinalIgnoreCase);

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
                    .Select(link => new MapLink(binding.MapId, link.TargetLocationId, link.TargetEntryKey))));

        public IReadOnlyList<MapLink> LinksFrom(string mapId) =>
            _linksFrom.TryGetValue(mapId, out var links) ? links : Array.Empty<MapLink>();

        /// <summary>Whether a chain of links leads from one map to the other; a map always reaches itself.</summary>
        public bool CanReach(string fromMapId, string toMapId)
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { fromMapId };
            var queue = new Queue<string>(seen);
            while (queue.Count > 0)
            {
                var map = queue.Dequeue();
                if (string.Equals(map, toMapId, StringComparison.OrdinalIgnoreCase)) return true;
                foreach (var link in LinksFrom(map))
                    if (seen.Add(link.ToMapId)) queue.Enqueue(link.ToMapId);
            }
            return false;
        }
    }
}
