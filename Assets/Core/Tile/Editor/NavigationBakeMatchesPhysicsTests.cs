using System.Collections.Generic;
using System.Linq;
using Core.Tile.Vulcanus;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor
{
    /// <summary>
    /// Routes for maps that aren't loaded are planned from the baked blocked cells, so they must agree with the static
    /// collision physics builds for the same map: tile colliders, drawn water, map collision shapes and placed objects.
    /// </summary>
    public sealed class NavigationBakeMatchesPhysicsTests
    {
        // Far from anything in the open scene, so only this map's colliders answer.
        private static readonly Vector3 Away = new(5000, -5000, 0);

        [TestCase("test:map-1")]
        public void EveryBakedBlockedCellIsBlockedByPhysicsAndNoOther(string mapId)
        {
            var world = TestWorld.Create();
            var instance = Object.Instantiate(world.MapBindings.Single(binding => binding.MapId == mapId).MapPrefab, Away, Quaternion.identity);
            Object.DestroyImmediate(world);
            try
            {
                Physics2D.SyncTransforms();
                var grid = instance.GetComponentInChildren<VulcanusImportedMap>(true).NavigationCosts;
                var filter = new ContactFilter2D { useTriggers = false };
                var hits = new Collider2D[8];
                var disagreements = new List<string>();
                var blockedCount = 0;
                for (var y = 0; y < grid.Height; y++)
                    for (var x = 0; x < grid.Width; x++)
                    {
                        // The middle half of the drawn tile, the footprint the bake uses.
                        var centre = (Vector2)Away + new Vector2(x + 0.5f, y + 0.5f) + MapManager.TileVisualOffset;
                        var count = Physics2D.OverlapBox(centre, new Vector2(0.5f, 0.5f), 0f, filter, hits);
                        var physics = hits.Take(count).Any(hit => hit.transform.IsChildOf(instance.transform));
                        var baked = grid.IsBlocked(new Vector2Int(x, y));
                        if (baked) blockedCount++;
                        if (baked != physics)
                            disagreements.Add($"Vulcanus tile ({x}, {grid.Height - 1 - y}): baked {baked}, physics {physics}");
                    }
                Assert.That(blockedCount, Is.GreaterThan(0), "The map has static collision to compare.");
                Assert.That(disagreements, Is.Empty);
            }
            finally { Object.DestroyImmediate(instance); }
        }
    }
}
