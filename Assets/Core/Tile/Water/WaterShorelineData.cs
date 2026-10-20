using System;
using UnityEngine;

namespace Core.Tile.Water
{
    /// <summary>Import-time geometry, shared by every instance of an imported water body.</summary>
    public sealed class WaterShorelineData : ScriptableObject
    {
        public const int ChunkSize = 128;
        [SerializeField] private Texture2DArray distances;
        [SerializeField] private Texture2D pages;
        [SerializeField] private Vector2Int originPixels;
        [SerializeField] private int maximumDistance;

        public Texture2DArray Distances => distances;
        public Texture2D Pages => pages;
        public Vector2Int OriginPixels => originPixels;
        public int MaximumDistance => maximumDistance;

        public void Configure(Texture2DArray distanceTexture, Texture2D pageTexture, Vector2Int origin, int distance)
        {
            distances = distanceTexture;
            pages = pageTexture;
            originPixels = origin;
            maximumDistance = distance;
            Validate();
        }

        public void Validate()
        {
            if (!distances || !pages || maximumDistance <= 0 ||
                distances.width != ChunkSize || distances.height != ChunkSize || distances.depth < 1 ||
                distances.format != TextureFormat.RFloat || pages.format != TextureFormat.RFloat ||
                distances.filterMode != FilterMode.Point || pages.filterMode != FilterMode.Point)
                throw new InvalidOperationException($"Water shoreline '{name}' requires valid point-filtered distance chunks and a page table.");
        }

        internal void Apply(MaterialPropertyBlock properties)
        {
            properties.SetTexture("_ShorelineDistances", distances);
            properties.SetTexture("_ShorelinePages", pages);
            properties.SetVector("_ShorelineLayout", new Vector4(originPixels.x, originPixels.y, pages.width, pages.height));
            properties.SetVector("_ShorelineRange", new Vector4(ChunkSize, maximumDistance, 0, 0));
        }
    }
}
