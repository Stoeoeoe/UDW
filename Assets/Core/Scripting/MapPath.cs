using System;
using System.Collections.Generic;
using System.Linq;
using Core.Tile.Vulcanus;
using UnityEngine;

namespace Core.Scripting
{
    [Serializable]
    public sealed class MapPath
    {
        [SerializeField] private MapPosition[] points;
        public IReadOnlyList<MapPosition> Points => Array.AsReadOnly(points);

        public MapPath(MapPosition[] points)
        {
            if (points == null || points.Length == 0)
                throw new ArgumentException("A walking path requires at least one position.", nameof(points));
            this.points = (MapPosition[])points.Clone();
        }

        public Vector2[] ToWorld(VulcanusImportedMap map) => points.Select(point => (Vector2)point.ToWorld(map)).ToArray();
    }
}
