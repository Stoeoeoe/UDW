using MoreMountains.Feedbacks;
using UnityEngine;

namespace Core.Items
{
    /// <summary>
    /// Optional component on a world item's visual prefab.
    /// Exposes MMF_Player slots for enter-zone and pickup effects (particles, flash, etc.).
    /// If absent, no visual feedback plays — sound is always handled by ItemManager.
    /// </summary>
    public class WorldItemVisual : MonoBehaviour
    {
        [Tooltip("Played when the player enters the magnet radius.")]
        [SerializeField] private MMF_Player _enterZoneFeedback;

        [Tooltip("Played at the moment the item is picked up.")]
        [SerializeField] private MMF_Player _pickupFeedback;

        public void PlayEnterZone() => _enterZoneFeedback?.PlayFeedbacks();
        public void PlayPickup()    => _pickupFeedback?.PlayFeedbacks();
    }
}
