using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Core.Tile.Water
{
    [ExecuteAlways, DisallowMultipleComponent, RequireComponent(typeof(Tilemap), typeof(TilemapRenderer))]
    public sealed class WaterBody : MonoBehaviour
    {
        internal static readonly HashSet<WaterBody> ActiveBodies = new();
        [SerializeField] private WaterProfile profile;
        [SerializeField, Min(1)] private int pixelsPerUnit;
        [SerializeField] private WaterShorelineData shoreline;
        [SerializeField] private WaterFlowData flow;
        [SerializeField, Tooltip("The map's swell direction. Zero uses the profile's.")]
        private Vector2 swellDirection;
        private Tilemap surface;
        private Matrix4x4 shorelineWorldToLocal;

        public WaterProfile Profile => profile;
        public int PixelsPerUnit => pixelsPerUnit;
        public WaterShorelineData Shoreline => shoreline;
        /// <summary>Optional currents generated from this body's geometry; replaces the profile's flow map.</summary>
        public WaterFlowData Flow => flow;
        /// <summary>The map's swell travel direction, or zero for the profile's own.</summary>
        public Vector2 SwellDirection => swellDirection;
        internal Tilemap Surface => surface;

        public void Configure(WaterProfile waterProfile, int ppu, WaterShorelineData shorelineData, WaterFlowData flowData = null,
            Vector2 swellDirectionOverride = default)
        {
            profile = waterProfile;
            pixelsPerUnit = ppu;
            shoreline = shorelineData;
            flow = flowData;
            swellDirection = swellDirectionOverride;
            ApplyProfile();
        }

        public void Validate()
        {
            if (!profile || pixelsPerUnit <= 0)
                throw new InvalidOperationException($"Water body '{name}' requires a profile and positive pixels per unit.");
            profile.Validate();
            if (!shoreline)
                throw new InvalidOperationException($"Water body '{name}' requires baked shoreline data. Reimport its map.");
            shoreline.Validate();
            if (profile.material.shader.name == WaterProfile.OceanShaderName && profile.oceanBeachSlopePixels > shoreline.MaximumDistance)
                throw new InvalidOperationException($"Water body '{name}' ocean beach slope exceeds its baked {shoreline.MaximumDistance}-pixel range. Increase the map importer's shoreline distance and reimport.");
            if (flow) flow.Validate();
            if (profile.foamWidth > shoreline.MaximumDistance || profile.shallowWaterWidth > shoreline.MaximumDistance ||
                profile.shoreWaveWidth > shoreline.MaximumDistance)
                throw new InvalidOperationException($"Water body '{name}' shoreline widths exceed its baked {shoreline.MaximumDistance}-pixel range. Increase the map importer's shoreline distance and reimport.");
            // The surf doubles in a storm; beyond the baked range all water would read as surf.
            if ((profile.swellEnabled || profile.material.shader.name == WaterProfile.OceanShaderName) &&
                (profile.swellShoalPixels > shoreline.MaximumDistance || profile.surfPixels * 2 > shoreline.MaximumDistance))
                throw new InvalidOperationException($"Water body '{name}' swell shoaling or storm surf exceeds its baked {shoreline.MaximumDistance}-pixel range. Increase the map importer's shoreline distance and reimport.");
            if (!float.IsFinite(swellDirection.x) || !float.IsFinite(swellDirection.y))
                throw new InvalidOperationException($"Water body '{name}' has an invalid swell direction.");
            if (profile.depthEnabled && profile.depthStartPixels + profile.depthBlendPixels > shoreline.MaximumDistance)
                throw new InvalidOperationException($"Water body '{name}' depth start plus blend exceeds its baked {shoreline.MaximumDistance}-pixel range. Increase the map importer's shoreline distance and reimport.");
        }

        public void ApplyProfile()
        {
            Validate();
            var renderer = GetComponent<TilemapRenderer>();
            renderer.sharedMaterial = profile.material;
            var properties = new MaterialPropertyBlock();
            renderer.GetPropertyBlock(properties);
            profile.Apply(properties, pixelsPerUnit);
            shoreline.Apply(properties);
            if (flow) flow.Apply(properties, transform, pixelsPerUnit, profile);
            if (swellDirection != Vector2.zero) profile.ApplySwellDirection(properties, swellDirection);
            shorelineWorldToLocal = transform.worldToLocalMatrix;
            properties.SetMatrix("_WaterWorldToLocal", shorelineWorldToLocal);
            renderer.SetPropertyBlock(properties);
        }

        // Map roots can be repositioned in the scene; the baked distances stay in map-local pixels.
        private void LateUpdate()
        {
            if (transform.worldToLocalMatrix != shorelineWorldToLocal) ApplyProfile();
        }

        private void OnEnable()
        {
            surface = GetComponent<Tilemap>();
            ApplyProfile();
            if (gameObject.scene.IsValid()) ActiveBodies.Add(this);
        }

        private void OnDisable() => ActiveBodies.Remove(this);
    }
}
