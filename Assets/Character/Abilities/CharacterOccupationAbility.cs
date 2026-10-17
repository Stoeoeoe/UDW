using Character;
using Core.Context;
using Input;

namespace Character.Abilities
{
    /// <summary>Accepts the player's exit request while ordinary abilities are blocked by occupation.</summary>
    public sealed class CharacterOccupationAbility : CharacterAbility
    {
        public override void Tick()
        {
            var occupation = Character.Occupation;
            if (!occupation.IsOccupied || Character.ConditionState != ConditionState.Normal) return;
            if (!PlayerInteractionContext.Instance.CurrentSnapshot.CanInteractWithWorld) return;
            var input = InputManager.Instance;
            if (input.InteractPressed || input.PerformPrimaryActionDown)
                occupation.TryExit();
        }
    }
}
