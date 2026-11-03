using VContainer;
using Core;
using Core.Inventory;
using UnityEngine;
using UnityEngine.Audio;

namespace Core.Items
{
    /// <summary>
    /// Creates item drops and applies the root's authored pickup settings.
    /// </summary>
    public sealed class ItemManager
    {
        private readonly IObjectResolver _resolver;
        private readonly ItemSettings _settings;

        public ItemManager(IObjectResolver resolver, ItemSettings settings)
        {
            settings.Validate();
            _resolver = resolver;
            _settings = settings;
        }

        public WorldItem PrepareDrop(ItemDefinition item, int quantity, Vector3 position, float pickupDelay = 0f)
        {
            return WorldItem.CreateInactive(_resolver, item, quantity, position, _settings.droppedItemPrefab, pickupDelay);
        }

        public bool TryDrop(SlotInventory inventory, int slot, Vector3 position)
        {
            var stack = inventory.GetSlot(slot);
            if (stack.IsEmpty || stack.Item.PreventDropping || inventory.HeldStack.IsOccupied) return false;
            var dropped = PrepareDrop(stack.Item, stack.Quantity, position + (Vector3)_settings.dropOffset, _settings.dropPickupDelay);
            inventory.Storage.SetSlot(slot, ItemStack.Empty);
            dropped.gameObject.SetActive(true);
            InventoryChangedEvent.Trigger(inventory);
            return true;
        }

        public float MagnetRadius => _settings.magnetRadius;
        public float PickupRadius => _settings.pickupRadius;
        public float MaxSpeed => _settings.maxSpeed;
        public float FadeStartDistance => _settings.fadeStartDistance;
        public float FadeDuration => _settings.fadeDuration;
        public AnimationCurve MagnetCurve => _settings.magnetCurve;

        /// <summary>
        /// Samples the magnet curve to get a speed value for the current distance.
        /// </summary>
        /// <param name="dist">Current distance from target.</param>
        public float EvaluateSpeed(float dist)
        {
            // t=0 when just entering magnetRadius, t=1 when at pickupRadius
            float range = MagnetRadius - PickupRadius;
            float t = range > 0f ? 1f - Mathf.Clamp01((dist - PickupRadius) / range) : 1f;
            return MaxSpeed * MagnetCurve.Evaluate(t);
        }

        /// <summary>
        /// Plays the pickup sound for an item. Uses the item's own clip if set, otherwise falls back to the default.
        /// </summary>
        public void PlayPickupSound(AudioClip overrideClip = null)
        {
            var clip = overrideClip ? overrideClip : _settings.defaultPickupSound;
            if (!clip) return;

            float pitch = Random.Range(_settings.pitchMin, _settings.pitchMax);
            MoreMountains.Tools.MMSfxEvent.Trigger(clip, _settings.audioMixerGroup, _settings.volume, pitch);
        }

        public void RequirePickupSound(AudioClip overrideClip) => _settings.RequirePickupSound(overrideClip);
    }
}
