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
        private Tilemap surface;
        private Matrix4x4 shorelineWorldToLocal;

        public WaterProfile Profile => profile;
        public int PixelsPerUnit => pixelsPerUnit;
        public WaterShorelineData Shoreline => shoreline;
        internal Tilemap Surface => surface;

        public void Configure(WaterProfile waterProfile, int ppu, WaterShorelineData shorelineData)
        {
            profile = waterProfile;
            pixelsPerUnit = ppu;
            shoreline = shorelineData;
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
            if (profile.foamWidth > shoreline.MaximumDistance || profile.shallowWaterWidth > shoreline.MaximumDistance ||
                profile.shoreWaveWidth > shoreline.MaximumDistance)
                throw new InvalidOperationException($"Water body '{name}' shoreline widths exceed its baked {shoreline.MaximumDistance}-pixel range. Increase the map importer's shoreline distance and reimport.");
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
