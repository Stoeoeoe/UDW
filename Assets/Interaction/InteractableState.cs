using System;
using Core.Game;

namespace Interaction
{
    /// <summary>Saved uses and next-use time for one placed interactable.</summary>
    [Serializable]
    public sealed class InteractableState : WorldObjectState
    {
        public int uses;
        public long availableAtMinute;

        public InteractableState() { }

        /// <summary>Starts a cooldown relative to the current in-game time.</summary>
        public InteractableState(int hoursFromNow)
        {
            availableAtMinute = GameState.Time.TotalMinutes + (long)hoursFromNow * 60;
        }

        public bool IsUsedUp(int maximumUses) => maximumUses >= 0 && uses >= maximumUses;
        public bool IsCoolingDown(long currentMinute) => currentMinute < availableAtMinute;
    }
}
