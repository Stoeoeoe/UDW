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

        public WaterProfile Profile => profile;
        public int PixelsPerUnit => pixelsPerUnit;
        public WaterShorelineData Shoreline => shoreline;

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
            renderer.SetPropertyBlock(properties);
        }

        private void OnEnable()
        {
            ApplyProfile();
            if (gameObject.scene.IsValid()) ActiveBodies.Add(this);
        }

        private void OnDisable() => ActiveBodies.Remove(this);
    }
}
