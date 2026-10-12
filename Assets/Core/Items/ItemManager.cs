using Core;
using Core.Inventory;
using UnityEngine;
using UnityEngine.Audio;

namespace Core.Items
{
    /// <summary>
    /// Global configuration for world items: magnet behaviour and default pickup sound.
    /// Lives on SystemRoot (persistent across scenes).
    /// </summary>
    public class ItemManager : Singleton<ItemManager>
    {
        [Header("Magnet")]
        [SerializeField] private float magnetRadius = 2.5f;
        [SerializeField] private float pickupRadius = 0.25f;
        [SerializeField] private float maxSpeed     = 12f;
        [Tooltip("Speed multiplier over normalized approach distance. X=0 is just entering range, X=1 is at pickup radius.")]
        [SerializeField] private AnimationCurve magnetCurve = AnimationCurve.EaseInOut(0f, 0.1f, 1f, 1f);

        [Header("Fade")]
        [Tooltip("Item begins fading to transparent when closer than this distance to the player.")]
        [SerializeField] private float fadeStartDistance = 0.6f;
        [SerializeField] private float fadeDuration      = 0.15f;

        [Header("Default Pickup Sound")]
        [SerializeField] private AudioClip       defaultPickupSound;
        [SerializeField] private AudioMixerGroup audioMixerGroup;
        [SerializeField] private float           volume   = 1f;
        [SerializeField] [Range(0f, 2f)] private float pitchMin = 0.9f;
        [SerializeField] [Range(0f, 2f)] private float pitchMax = 1.1f;
        [Header("Dropping")]
        [SerializeField] private WorldItem droppedItemPrefab;
        [SerializeField] private Vector2 dropOffset = new(0f, -1f);
        [SerializeField, Min(0f)] private float dropPickupDelay = 2f;

        public static WorldItem PrepareDrop(ItemDefinition item, int quantity, Vector3 position, float pickupDelay = 0f)
        {
            var manager = Instance;
            return WorldItem.CreateInactive(item, quantity, position, manager ? manager.droppedItemPrefab : null, pickupDelay);
        }

        public bool TryDrop(SlotInventory inventory, int slot, Vector3 position)
        {
            if (!droppedItemPrefab) throw new System.InvalidOperationException("ItemManager requires a dropped-item prefab.");
            var stack = inventory.GetSlot(slot);
            if (stack.IsEmpty || stack.Item.PreventDropping || inventory.HeldStack.IsOccupied) return false;
            var dropped = PrepareDrop(stack.Item, stack.Quantity, position + (Vector3)dropOffset, dropPickupDelay);
            inventory.Storage.SetSlot(slot, ItemStack.Empty);
            dropped.gameObject.SetActive(true);
            InventoryChangedEvent.Trigger(inventory);
            return true;
        }

        public float          MagnetRadius      => magnetRadius;
        public float          PickupRadius      => pickupRadius;
        public float          MaxSpeed          => maxSpeed;
        public float          FadeStartDistance => fadeStartDistance;
        public float          FadeDuration      => fadeDuration;
        public AnimationCurve MagnetCurve       => magnetCurve;

        /// <summary>
        /// Samples the magnet curve to get a speed value for the current distance.
        /// </summary>
        /// <param name="dist">Current distance from target.</param>
        public float EvaluateSpeed(float dist)
        {
            // t=0 when just entering magnetRadius, t=1 when at pickupRadius
            float range = magnetRadius - pickupRadius;
            float t     = range > 0f ? 1f - Mathf.Clamp01((dist - pickupRadius) / range) : 1f;
            return maxSpeed * magnetCurve.Evaluate(t);
        }

        /// <summary>
        /// Plays the pickup sound for an item. Uses the item's own clip if set, otherwise falls back to the default.
        /// </summary>
        public void PlayPickupSound(AudioClip overrideClip = null)
        {
            var clip = overrideClip ? overrideClip : defaultPickupSound;
            if (!clip) return;

            float pitch = Random.Range(pitchMin, pitchMax);
            MoreMountains.Tools.MMSfxEvent.Trigger(clip, audioMixerGroup, volume, pitch);
        }
    }
}
