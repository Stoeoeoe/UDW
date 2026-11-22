using Character;
using Core.Divinity;
using Core.TimeAndWeather;
using UnityEngine;
using VContainer;

namespace Interaction
{
    /// <summary>Grants favour for a selected deity when used.</summary>
    public sealed class DivineFavourInteractable : AbstractInteractable
    {
        public override InteractionVerb Verb => InteractionVerb.Pray;

        [Inject] private DivineFavour _divineFavour;

        [SerializeField] private DeityDefinition deity;
        [Min(1)] [SerializeField] private int favourPoints = 1;

        public override bool CanInteract => deity != null && favourPoints > 0 && base.CanInteract;

        private void Reset()
        {
            cooldownMode = InteractionCooldownMode.UntilTime;
            cooldownBoundary = GameTimeBoundary.NextDay;
        }

        protected override bool Interact(GameCharacter instigator)
        {
            _divineFavour.AddFavour(deity.Id, favourPoints);
            return true;
        }
    }
}
