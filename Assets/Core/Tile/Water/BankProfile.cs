using System;
using UnityEngine;

namespace Core.Tile.Water
{
    public enum BankLayerKind
    {
        /// <summary>A range of distances from the water, filled with a colour or a tileable pattern.</summary>
        Band,
        /// <summary>Art drawn along the shoreline: x runs along the shore, y away from the water.</summary>
        Strip
    }

    [Serializable]
    public sealed class BankLayer
    {
        public BankLayerKind kind;
        [Min(0), Tooltip("Band: distance from the water, in logical pixels, where the band starts. 0 is the first land pixel.")]
        public float startPixels;
        [Min(0), Tooltip("Band: distance where the band ends. A strip covers as many pixels as its texture is tall.")]
        public float endPixels = 2;
        [Range(0, 1), Tooltip("Share of pixels drawn where the layer starts. Missed pixels fall through to the next layer.")]
        public float coverageStart = 1;
        [Range(0, 1), Tooltip("Share of pixels drawn where the layer ends. Below 1 the layer thins out with dithering, never with blended colours.")]
        public float coverageEnd = 1;
        [Tooltip("Band: the colour, unless a texture is assigned.")]
        public Color color = Color.white;
        [Tooltip("Band: optional tileable pattern, sampled in world pixels. Strip: required. Its top row lies against the water and columns follow the shore with the water on the left. Must be readable; transparent pixels fall through.")]
        public Texture2D texture;
    }

    /// <summary>
    /// What surrounds a drawn body of water. Layers run from the water outwards; each land pixel takes the first
    /// layer that claims it. Baked at import into a sprite tilemap beside the water, so banks are pixel-exact.
    /// </summary>
    public sealed class BankProfile : ScriptableObject
    {
        public const int MaximumDepthPixels = 64;

        public BankLayer[] layers = Array.Empty<BankLayer>();
        [Tooltip("Fade coverage with transparency instead of dithering. Smoother, but faded pixels are blended colours, not palette colours.")]
        public bool fadeWithTransparency;
        [Range(0, 1), Tooltip("With transparency fading: how much an ordered dither pattern varies each pixel's opacity on land, for a little pixel texture where the bank thins out. 0 is perfectly smooth. The creep into the water is always smooth.")]
        public float ditherStrength;
        [Min(0), Tooltip("How far, in pixels, band edges wander so they do not mirror the shoreline.")]
        public float edgeNoisePixels = 1;
        [Min(1), Tooltip("Size, in pixels, of the wander. Larger is gentler.")]
        public float edgeNoiseScale = 8;
        [Range(0, 8), Tooltip("How far, in pixels, the bank creeps over the water's edge, softening the step from foam to bank. 0 keeps it on land.")]
        public int shallowPixels;
        [Tooltip("Colour of the creep into the water.")]
        public Color shallowColor = Color.white;
        [Range(0, 1), Tooltip("Share of pixels drawn at the shoreline, thinning to nothing at the end of the creep, with dithering.")]
        public float shallowCoverage = 0.5f;

        /// <summary>The farthest land pixel, from the water, that any layer can reach.</summary>
        public int DepthPixels
        {
            get
            {
                var depth = 0f;
                foreach (var layer in layers)
                    depth = Mathf.Max(depth, layer.kind == BankLayerKind.Strip && layer.texture
                        ? layer.texture.height
                        : layer.endPixels + edgeNoisePixels);
                return Mathf.CeilToInt(depth);
            }
        }

        public void Validate()
        {
            if (layers == null || layers.Length == 0)
                throw new InvalidOperationException($"Bank profile '{name}' needs at least one layer.");
            if (!float.IsFinite(edgeNoisePixels) || edgeNoisePixels < 0 || !float.IsFinite(edgeNoiseScale) || edgeNoiseScale < 1)
                throw new InvalidOperationException($"Bank profile '{name}' has invalid edge noise settings.");
            for (var i = 0; i < layers.Length; i++)
            {
                var layer = layers[i];
                if (!float.IsFinite(layer.coverageStart) || !float.IsFinite(layer.coverageEnd) ||
                    layer.coverageStart < 0 || layer.coverageStart > 1 || layer.coverageEnd < 0 || layer.coverageEnd > 1)
                    throw new InvalidOperationException($"Bank profile '{name}' layer {i + 1} coverage must be in [0,1].");
                if (layer.kind == BankLayerKind.Strip)
                {
                    if (!layer.texture)
                        throw new InvalidOperationException($"Bank profile '{name}' layer {i + 1} is a strip and needs a texture.");
                    continue;
                }
                if (!float.IsFinite(layer.startPixels) || !float.IsFinite(layer.endPixels) || layer.startPixels < 0 || layer.endPixels <= layer.startPixels)
                    throw new InvalidOperationException($"Bank profile '{name}' layer {i + 1} needs 0 <= start < end.");
                if (!layer.texture && layer.color.a <= 0)
                    throw new InvalidOperationException($"Bank profile '{name}' layer {i + 1} is a band with a transparent colour and no texture.");
            }
            if (!float.IsFinite(ditherStrength) || ditherStrength < 0 || ditherStrength > 1)
                throw new InvalidOperationException($"Bank profile '{name}' dither strength must be in [0,1].");
            if (shallowPixels < 0 || shallowPixels > 8 || !float.IsFinite(shallowCoverage) || shallowCoverage < 0 || shallowCoverage > 1 ||
                (shallowPixels > 0 && shallowColor.a <= 0))
                throw new InvalidOperationException($"Bank profile '{name}' has invalid shallows: 0-8 pixels, a coverage in [0,1] and an opaque colour.");
            if (DepthPixels > MaximumDepthPixels)
                throw new InvalidOperationException($"Bank profile '{name}' reaches {DepthPixels} pixels from the water; the limit is {MaximumDepthPixels}.");
        }
    }
}
