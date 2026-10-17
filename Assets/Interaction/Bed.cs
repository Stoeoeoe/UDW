using Character;
using UnityEngine;

namespace Interaction
{
    /// <summary>A sleep interactable with a stable instance identity and a slot exit used as its standing wake-up point.</summary>
    [RequireComponent(typeof(InteractionSlot))]
    public sealed class Bed : AdvanceDayInteractable
    {
        public InteractionSlot Slot { get; private set; }

        protected override void Awake()
        {
            base.Awake();
            Slot = GetComponent<InteractionSlot>();
        }

        /// <summary>Places the player beside the bed without claiming it or playing a hop.</summary>
        public void PlaceCharacter(MainCharacter character)
        {
            character.Occupation.ReleaseImmediately();
            character.Controller.Stop();
            character.transform.position = Slot.ExitPoint.position;
            character.Orientation.ForceDirection(Slot.Facing);
            character.Tiles.OnPlaced();
        }
    }
}
