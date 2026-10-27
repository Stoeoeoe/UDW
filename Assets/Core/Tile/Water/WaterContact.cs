using System;
using UnityEngine;

namespace Core.Tile.Water
{
    /// <summary>
    /// An object that touches water at its ground anchor: foam ring while standing in water,
    /// a splash when entering it and wake ripples while moving through it.
    /// </summary>
    [ExecuteAlways, DisallowMultipleComponent]
    public sealed class WaterContact : MonoBehaviour
    {
        [SerializeField] private Transform anchor;
        [SerializeField] private bool foam = true;
        [SerializeField, Tooltip("Foam ellipse half-size in logical pixels.")]
        private Vector2Int foamRadiusPixels = new(6, 2);
        [SerializeField, Min(0), Tooltip("Logical pixels travelled in water between wake ripples. Zero disables wakes.")]
        private int wakeSpacingPixels = 6;
        [SerializeField, Range(1, WaterInteraction.MaxRadiusPixels)]
        private int wakeRadiusPixels = 5;
        [SerializeField, Range(0, WaterInteraction.MaxRadiusPixels), Tooltip("Ripple when entering water. Zero disables it.")]
        private int entrySplashRadiusPixels = 10;

        private WaterBody body;
        private Vector2 lastWake;

        public Transform Anchor => anchor;
        /// <summary>The water body the anchor currently stands in, or null.</summary>
        public WaterBody Body => body;

        internal bool FoamVisible => foam && body;

        internal Bounds FoamBounds
        {
            get
            {
                var ppu = body ? body.PixelsPerUnit : 1;
                var size = new Vector3((foamRadiusPixels.x + 3) * 2f / ppu, (foamRadiusPixels.y + 3) * 2f / ppu, 1);
                return new Bounds(anchor.position, size);
            }
        }

        internal Vector4 FoamData
        {
            get
            {
                var position = anchor.position;
                return new Vector4(position.x, position.y, foamRadiusPixels.x, foamRadiusPixels.y);
            }
        }

        public void Configure(Transform groundAnchor)
        {
            anchor = groundAnchor;
            Validate();
        }

        public void Validate()
        {
            if (!anchor)
                throw new InvalidOperationException($"Water contact '{name}' requires a ground anchor.");
            if (foam && (foamRadiusPixels.x < 1 || foamRadiusPixels.y < 1 ||
                foamRadiusPixels.x > WaterInteraction.MaxRadiusPixels || foamRadiusPixels.y > WaterInteraction.MaxRadiusPixels))
                throw new InvalidOperationException($"Water contact '{name}' foam radius must be 1 to {WaterInteraction.MaxRadiusPixels} pixels.");
            if (wakeSpacingPixels < 0 || wakeRadiusPixels < 1 || wakeRadiusPixels > WaterInteraction.MaxRadiusPixels ||
                entrySplashRadiusPixels < 0 || entrySplashRadiusPixels > WaterInteraction.MaxRadiusPixels)
                throw new InvalidOperationException($"Water contact '{name}' has invalid wake or splash settings.");
        }

        private void Reset() => anchor = transform;

        private void OnEnable()
        {
            Validate();
            body = null;
            if (gameObject.scene.IsValid()) WaterInteraction.ActiveContacts.Add(this);
        }

        private void OnDisable()
        {
            WaterInteraction.ActiveContacts.Remove(this);
            body = null;
        }

        private void LateUpdate()
        {
            var position = (Vector2)anchor.position;
            var wasInWater = (bool)body;
            WaterInteraction.TryGetBody(position, out body);
            if (!Application.isPlaying || !body) return;

            if (!wasInWater)
            {
                if (entrySplashRadiusPixels > 0) WaterInteraction.SpawnRipple(position, entrySplashRadiusPixels);
                lastWake = position;
                return;
            }

            if (wakeSpacingPixels == 0) return;
            var spacing = (float)wakeSpacingPixels / body.PixelsPerUnit;
            if ((position - lastWake).sqrMagnitude < spacing * spacing) return;
            WaterInteraction.SpawnRipple(position, wakeRadiusPixels);
            lastWake = position;
        }
    }
}
