using Character;
using Core.TimeAndWeather;
using VContainer;

namespace Interaction
{
    /// <summary>
    /// Interactable that advances to the next in-game day (e.g. a bed).
    /// </summary>
    public class AdvanceDayInteractable : AbstractInteractable
    {
        public override InteractionVerb Verb => InteractionVerb.Sleep;

        [Inject] private OvernightTransition _overnight;

        protected override bool Interact(GameCharacter instigator)
        {
            _overnight.EndDay();
            return true;
        }
    }
}
