using System;
using System.Collections.Generic;
using Core;
using Core.Context;
using UnityEngine;
using VContainer;

namespace Interaction.Highlight
{
    /// <summary>
    /// Draws the player's current interaction target with the highlight material (the outline) and restores each
    /// sprite's own material once it stops being the target. Rechecked every frame, so sprites a target creates or removes
    /// (a crop's growth stage) follow without notifications.
    /// </summary>
    public sealed class InteractionHighlighter : GameManager
    {
        // Target sprites must use this material; the highlight shaders are copies of it with an outline or a glow.
        private const string DefaultSpriteShader = "Universal Render Pipeline/2D/Sprite-Lit-Default";

        private static readonly int SpriteUVRectId = Shader.PropertyToID("_SpriteUVRect");
        private static readonly int SpriteLocalRectId = Shader.PropertyToID("_SpriteLocalRect");
        private static readonly int SpriteTexelSizeId = Shader.PropertyToID("_SpriteTexelSize");

        [Inject] private PlayerInteractionContext _context;

        [SerializeField] private Material highlightMaterial;

        private readonly Dictionary<SpriteRenderer, Material> _highlighted = new();
        private readonly List<SpriteRenderer> _sprites = new();
        private readonly List<SpriteRenderer> _released = new();
        private MaterialPropertyBlock _properties;

        protected override void OnAwake()
        {
            if (!highlightMaterial)
                throw new InvalidOperationException($"{nameof(InteractionHighlighter)} requires its highlight material.");
        }

        private void LateUpdate() => Show(_context.CurrentSnapshot.ActionableInteractable);

        protected override void OnDisable()
        {
            Show(null);
            base.OnDisable();
        }

        /// <summary>Highlights exactly the target's current sprites; null clears the highlight.</summary>
        public void Show(AbstractInteractable target)
        {
            _sprites.Clear();
            if (target) target.GetTargetSprites(_sprites);

            _released.Clear();
            foreach (var sprite in _highlighted.Keys)
                if (!_sprites.Contains(sprite)) _released.Add(sprite);
            foreach (var sprite in _released)
            {
                if (sprite) sprite.sharedMaterial = _highlighted[sprite];
                _highlighted.Remove(sprite);
            }

            foreach (var sprite in _sprites)
            {
                if (_highlighted.ContainsKey(sprite)) continue;
                var own = sprite.sharedMaterial;
                if (!own || own.shader.name != DefaultSpriteShader)
                    throw new InvalidOperationException(
                        $"Sprite '{sprite.name}' of interactable '{target.name}' must use the default lit sprite material to be highlighted.");
                // The outline grows the sprite's quad, so the sprite must be one quad (Mesh Type: Full Rect).
                if (sprite.sprite && sprite.sprite.vertices.Length != 4)
                    throw new InvalidOperationException(
                        $"Sprite '{sprite.sprite.name}' of interactable '{target.name}' must use the Full Rect mesh type to be highlighted.");
                _highlighted.Add(sprite, own);
                sprite.sharedMaterial = highlightMaterial;
            }

            // Animation changes the sprite, so its rect is published every frame. Other systems (water
            // reflections) keep their values in the same block.
            _properties ??= new MaterialPropertyBlock();
            foreach (var sprite in _sprites)
            {
                if (!sprite.sprite) continue;
                var texture = sprite.sprite.texture;
                var rect = sprite.sprite.textureRect;
                var local = sprite.sprite.bounds;
                var pixel = 1f / sprite.sprite.pixelsPerUnit;
                sprite.GetPropertyBlock(_properties);
                _properties.SetVector(SpriteUVRectId, new Vector4(rect.xMin / texture.width, rect.yMin / texture.height,
                    rect.xMax / texture.width, rect.yMax / texture.height));
                _properties.SetVector(SpriteLocalRectId, new Vector4(local.min.x, local.min.y, local.max.x, local.max.y));
                _properties.SetVector(SpriteTexelSizeId, new Vector4(1f / texture.width, 1f / texture.height, pixel, pixel));
                sprite.SetPropertyBlock(_properties);
            }
        }
    }
}
