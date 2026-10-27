using System;
using UnityEngine;
using UnityEngine.Serialization;

namespace Core.Tile.Water
{
    [CreateAssetMenu(menuName = "Water/Profile")]
    public sealed class WaterProfile : ScriptableObject
    {
        public const string ShaderName = "UrdewValley/Pixel Water";

        public Material material;
        public Color deepColor = new Color32(36, 82, 120, 255);
        public Color baseColor = new Color32(43, 111, 150, 255);
        public Color waveColor = new Color32(65, 143, 173, 255);
        public Color highlightColor = new Color32(116, 185, 194, 255);
        [Min(1), Tooltip("Whole-pixel animation steps per second.")]
        public float animationFps = 8;
        [Min(0)] public float waveSpeed = 0.3f;
        [Min(0.001f)] public float waveScale = 1.5f;
        [Range(0, 1)] public float causticIntensity = 0.35f;
        [Min(0.001f)] public float causticScale = 2f;
        public Vector2 flowDirection = new(1, 0.25f);

        [Header("Shoreline (logical pixels)")]
        public bool shorelineEnabled;
        public bool foamEnabled = true;
        [Min(0)] public float foamWidth = 1.5f;
        [Range(0, 1)] public float foamIntensity = 0.3f;
        [Min(0)] public float foamSpeed = 0.4f;
        public bool shoreWavesEnabled = true;
        [Min(0)] public float shoreWaveFrequency = 0.0833333f;
        [Min(0)] public float shoreWaveWidth = 1;
        [Min(0)] public float shoreWaveSpeed = 1.5f;
        public bool shallowWaterEnabled;
        [Min(0)] public float shallowWaterWidth = 3;

        [Header("Depth (logical pixels from shore)")]
        public bool depthEnabled;
        [Min(0), Tooltip("Distance from shore where deep water starts.")]
        public float depthStartPixels = 6;
        [Min(0), Tooltip("Width of the dithered transition. Zero gives a hard edge.")]
        public float depthBlendPixels = 4;

        [Header("Current")]
        public bool flowEnabled;
        [Min(0)] public float flowSpeed = 0.3f;
        [Range(0, 1)] public float flowStrength = 1;
        [Tooltip("Optional linear RGB flow data: R/G encode world X/Y direction (128 is neutral), B is local speed. No map uses uniform flowDirection.")]
        public Texture2D flowMap;
        [Tooltip("World XY position of the flow map's bottom-left corner.")]
        public Vector2 flowMapWorldOrigin;
        [Tooltip("World-space width and height covered by the flow map. Edge pixels extend outside this rectangle.")]
        public Vector2 flowMapWorldSize = new(16, 16);

        [Header("Surface highlights")]
        [FormerlySerializedAs("reflectionsEnabled")] public bool surfaceHighlightsEnabled;
        [FormerlySerializedAs("reflectionIntensity"), Range(0, 1)] public float surfaceHighlightIntensity = 0.25f;
        [FormerlySerializedAs("reflectionDensity"), Range(0, 1)] public float surfaceHighlightDensity = 0.2f;
        [FormerlySerializedAs("reflectionScale"), Min(0.001f)] public float surfaceHighlightScale = 1;
        [FormerlySerializedAs("reflectionSpeed"), Min(0)] public float surfaceHighlightSpeed = 0.15f;
        [FormerlySerializedAs("reflectionStretch")] public Vector2 surfaceHighlightStretch = new(4, 1);

        [Header("Object reflections")]
        public bool objectReflectionsEnabled;
        [Range(0, 1)] public float objectReflectionOpacity = 0.35f;
        [Min(0), Tooltip("Horizontal distortion in logical pixels.")]
        public float objectReflectionRipplePixels = 1;
        [Min(0)] public float objectReflectionRippleSpeed = 0.5f;

        [Header("Interaction")]
        [Tooltip("Expanding rings from WaterInteraction.SpawnRipple and WaterContact wakes.")]
        public bool interactionRipplesEnabled;
        [Tooltip("Raindrop splashes driven by WaterInteraction.Rain.")]
        public bool rainSplashesEnabled;
        [Tooltip("Foam rings around WaterContact objects standing in this water.")]
        public bool contactFoamEnabled;

        public void Validate()
        {
            if (!material || !material.shader || material.shader.name != ShaderName)
                throw new InvalidOperationException($"Water profile '{name}' requires a material using '{ShaderName}'.");
            if (!float.IsFinite(animationFps) || animationFps <= 0 ||
                !float.IsFinite(waveSpeed) || waveSpeed < 0 ||
                !float.IsFinite(waveScale) || waveScale <= 0 ||
                !float.IsFinite(causticIntensity) || causticIntensity < 0 || causticIntensity > 1 ||
                !float.IsFinite(causticScale) || causticScale <= 0 ||
                !float.IsFinite(flowDirection.x) || !float.IsFinite(flowDirection.y))
                throw new InvalidOperationException($"Water profile '{name}' has invalid animation settings.");
            ValidateColor(deepColor);
            ValidateColor(baseColor);
            ValidateColor(waveColor);
            ValidateColor(highlightColor);
            foreach (var value in new[] { foamWidth, foamSpeed, shoreWaveFrequency, shoreWaveWidth, shoreWaveSpeed,
                         shallowWaterWidth, depthStartPixels, depthBlendPixels, flowSpeed, surfaceHighlightSpeed,
                         objectReflectionRipplePixels, objectReflectionRippleSpeed })
                if (!float.IsFinite(value) || value < 0)
                    throw new InvalidOperationException($"Water profile '{name}' has invalid shoreline, depth, current, surface highlight or object reflection settings.");
            foreach (var value in new[] { foamIntensity, flowStrength, surfaceHighlightIntensity, surfaceHighlightDensity, objectReflectionOpacity })
                if (!float.IsFinite(value) || value < 0 || value > 1)
                    throw new InvalidOperationException($"Water profile '{name}' coverage and strength must be in [0,1].");
            if (!float.IsFinite(surfaceHighlightScale) || surfaceHighlightScale <= 0 ||
                !float.IsFinite(surfaceHighlightStretch.x) || surfaceHighlightStretch.x <= 0 ||
                !float.IsFinite(surfaceHighlightStretch.y) || surfaceHighlightStretch.y <= 0)
                throw new InvalidOperationException($"Water profile '{name}' surface highlight scale and stretch must be positive and finite.");
            if (!float.IsFinite(flowMapWorldOrigin.x) || !float.IsFinite(flowMapWorldOrigin.y) ||
                !float.IsFinite(flowMapWorldSize.x) || flowMapWorldSize.x <= 0 ||
                !float.IsFinite(flowMapWorldSize.y) || flowMapWorldSize.y <= 0)
                throw new InvalidOperationException($"Water profile '{name}' requires a finite flow map origin and positive, finite world size.");
            if (flowMap && (flowMap.isDataSRGB || flowMap.filterMode != FilterMode.Point ||
                flowMap.wrapModeU != TextureWrapMode.Clamp || flowMap.wrapModeV != TextureWrapMode.Clamp ||
                flowMap.mipmapCount != 1 || (flowMap.format != TextureFormat.RGB24 && flowMap.format != TextureFormat.RGBA32)))
                throw new InvalidOperationException($"Water profile '{name}' flow map requires linear RGB24/RGBA32 data, Point filtering, Clamp wrapping and no mipmaps. Disable sRGB and compression in its texture import settings.");
        }

        private void ValidateColor(Color color)
        {
            if (!float.IsFinite(color.r) || !float.IsFinite(color.g) || !float.IsFinite(color.b) ||
                color.r < 0 || color.r > 1 || color.g < 0 || color.g > 1 || color.b < 0 || color.b > 1 || color.a != 1)
                throw new InvalidOperationException($"Water profile '{name}' requires opaque, finite palette colors in [0,1].");
        }

        internal void Apply(MaterialPropertyBlock properties, int pixelsPerUnit)
        {
            properties.SetColor("_DeepColor", deepColor);
            properties.SetColor("_BaseColor", baseColor);
            properties.SetColor("_WaveColor", waveColor);
            properties.SetColor("_HighlightColor", highlightColor);
            properties.SetFloat("_AnimationFps", animationFps);
            properties.SetFloat("_WaveSpeed", waveSpeed);
            properties.SetFloat("_WaveScale", waveScale);
            properties.SetFloat("_CausticIntensity", causticIntensity);
            properties.SetFloat("_CausticScale", causticScale);
            properties.SetVector("_FlowDirection", flowDirection);
            properties.SetFloat("_PixelsPerUnit", pixelsPerUnit);
            properties.SetVector("_ShorelineEffects", new Vector4(shorelineEnabled ? 1 : 0, foamEnabled ? 1 : 0,
                shoreWavesEnabled ? 1 : 0, shallowWaterEnabled ? 1 : 0));
            properties.SetVector("_Foam", new Vector4(foamWidth, foamIntensity, foamSpeed, 0));
            properties.SetVector("_ShoreWaves", new Vector4(shoreWaveFrequency, shoreWaveWidth, shoreWaveSpeed, shallowWaterWidth));
            properties.SetVector("_Depth", new Vector4(depthEnabled ? 1 : 0, depthStartPixels, depthBlendPixels, 0));
            properties.SetVector("_Current", new Vector4(flowEnabled ? 1 : 0, flowSpeed, flowStrength, 0));
            properties.SetFloat("_FlowMapEnabled", flowMap ? 1 : 0);
            if (flowMap) properties.SetTexture("_FlowMap", flowMap);
            properties.SetVector("_FlowMapWorldRect", new Vector4(flowMapWorldOrigin.x, flowMapWorldOrigin.y,
                flowMapWorldSize.x, flowMapWorldSize.y));
            properties.SetVector("_SurfaceHighlights", new Vector4(surfaceHighlightsEnabled ? 1 : 0, surfaceHighlightIntensity, surfaceHighlightDensity, surfaceHighlightSpeed));
            properties.SetVector("_SurfaceHighlightShape", new Vector4(surfaceHighlightScale, surfaceHighlightStretch.x, surfaceHighlightStretch.y, 0));
            properties.SetVector("_ObjectReflections", new Vector4(objectReflectionsEnabled ? 1 : 0,
                objectReflectionOpacity, objectReflectionRipplePixels, objectReflectionRippleSpeed));
            properties.SetVector("_Interaction", new Vector4(interactionRipplesEnabled ? 1 : 0,
                rainSplashesEnabled ? 1 : 0, contactFoamEnabled ? 1 : 0, 0));
        }
    }
}
