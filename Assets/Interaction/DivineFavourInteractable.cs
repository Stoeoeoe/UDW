using Character;
using Core.Divinity;
using UnityEngine;

namespace Interaction
{
    /// <summary>Grants favour for a selected deity when used.</summary>
    public sealed class DivineFavourInteractable : AbstractInteractable
    {
        [SerializeField] private DeityDefinition deity;
        [Min(1)] [SerializeField] private int favourPoints = 1;

        public override bool CanInteract => deity != null && favourPoints > 0 && base.CanInteract;

        private void Reset()
        {
            cooldownMode = InteractionCooldownMode.UntilTime;
            cooldownBoundary = Core.TimeAndWeather.GameTimeBoundary.NextDay;
        }

        protected override void Interact(GameCharacter instigator)
        {
            DivineFavour.AddFavour(deity, favourPoints);
        }
    }
}
