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

        public bool IsUsedUp(int maximumUses) => maximumUses >= 0 && uses >= maximumUses;
        public bool IsCoolingDown(long currentMinute) => currentMinute < availableAtMinute;
    }
}
