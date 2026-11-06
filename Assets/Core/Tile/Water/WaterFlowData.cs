using System;
using UnityEngine;

namespace Core.Tile.Water
{
    /// <summary>
    /// Import-time current directions for one imported water body, in the same encoding as
    /// <see cref="WaterProfile.flowMap"/>. Placed in body-local logical pixels, so it follows the body's transform.
    /// </summary>
    public sealed class WaterFlowData : ScriptableObject
    {
        [SerializeField] private Texture2D map;
        [SerializeField] private Vector2Int originPixels;
        [SerializeField] private float speedScale = 1;

        public Texture2D Map => map;
        public Vector2Int OriginPixels => originPixels;
        /// <summary>The fastest authored stroke speed. The map's blue channel is a fraction of it.</summary>
        public float SpeedScale => speedScale;

        public void Configure(Texture2D flowMap, Vector2Int origin, float scale)
        {
            map = flowMap;
            originPixels = origin;
            speedScale = scale;
            Validate();
        }

        public void Validate()
        {
            if (!float.IsFinite(speedScale) || speedScale < 1)
                throw new InvalidOperationException($"Water flow '{name}' requires a finite speed scale of at least 1.");
            if (!map || map.isDataSRGB || map.filterMode != FilterMode.Point ||
                map.wrapModeU != TextureWrapMode.Clamp || map.wrapModeV != TextureWrapMode.Clamp ||
                map.mipmapCount != 1 || map.format != TextureFormat.RGB24)
                throw new InvalidOperationException($"Water flow '{name}' requires a linear RGB24 map with Point filtering, Clamp wrapping and no mipmaps.");
        }

        // Replaces the profile's own map settings for this body only.
        internal void Apply(MaterialPropertyBlock properties, Transform body, int pixelsPerUnit, WaterProfile profile)
        {
            // Strokes faster than the profile speed are encoded as a fraction of the fastest, so the body runs
            // at the profile's speed times that factor.
            properties.SetVector("_Current", new Vector4(profile.flowEnabled ? 1 : 0, profile.flowSpeed * speedScale,
                profile.flowStrength, 0));
            var origin = body.TransformPoint(new Vector3(originPixels.x, originPixels.y, 0) / pixelsPerUnit);
            properties.SetFloat("_FlowMapEnabled", 1);
            properties.SetTexture("_FlowMap", map);
            properties.SetVector("_FlowMapWorldRect", new Vector4(origin.x, origin.y,
                map.width / (float)pixelsPerUnit, map.height / (float)pixelsPerUnit));
        }
    }
}
