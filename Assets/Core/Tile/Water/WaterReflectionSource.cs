using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Core.Tile.Water
{
    /// <summary>Sprite visuals mirrored around an authored ground anchor. Terrain is never registered.</summary>
    [ExecuteAlways, DisallowMultipleComponent]
    public sealed class WaterReflectionSource : MonoBehaviour
    {
        internal static readonly HashSet<WaterReflectionSource> ActiveSources = new();
        private static readonly Dictionary<SpriteRenderer, WaterReflectionSource> Owners = new();
        [SerializeField] private Transform groundAnchor;
        [SerializeField] private SpriteRenderer[] sprites = Array.Empty<SpriteRenderer>();
        private SortingGroup sortingGroup;

        public Transform GroundAnchor => groundAnchor;
        public IReadOnlyList<SpriteRenderer> Sprites => sprites;
        internal SortingGroup Group => sortingGroup;

        public void Configure(Transform anchor, SpriteRenderer[] renderers)
        {
            Unregister();
            groundAnchor = anchor;
            sprites = renderers;
            Validate();
            if (isActiveAndEnabled && gameObject.scene.IsValid()) Register();
        }

        public void Validate()
        {
            if (!groundAnchor || sprites == null || sprites.Length == 0)
                throw new InvalidOperationException($"Reflection source '{name}' requires a ground anchor and at least one sprite renderer.");
            var unique = new HashSet<SpriteRenderer>();
            foreach (var sprite in sprites)
            {
                if (!sprite || !unique.Add(sprite))
                    throw new InvalidOperationException($"Reflection source '{name}' has a missing or duplicate sprite renderer.");
                if (sprite.drawMode != SpriteDrawMode.Simple || sprite.maskInteraction != SpriteMaskInteraction.None)
                    throw new InvalidOperationException($"Reflection source '{name}' supports Simple sprites without SpriteMask interaction.");
            }
        }

        private void Register()
        {
            Validate();
            foreach (var sprite in sprites)
                if (Owners.TryGetValue(sprite, out var owner) && owner != this)
                    throw new InvalidOperationException($"Sprite '{sprite.name}' belongs to both reflection sources '{owner.name}' and '{name}'.");
            sortingGroup = groundAnchor.GetComponentInParent<SortingGroup>();
            foreach (var sprite in sprites) Owners[sprite] = this;
            ActiveSources.Add(this);
        }

        private void Unregister()
        {
            if (!ActiveSources.Remove(this)) return; // Not registered, including inactive prefab configuration.
            foreach (var sprite in sprites) Owners.Remove(sprite);
        }

        private void OnEnable()
        {
            if (gameObject.scene.IsValid()) Register();
        }

        private void OnDisable() => Unregister();
    }
}
