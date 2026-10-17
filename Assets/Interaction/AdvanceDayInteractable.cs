using Character;
using Core.TimeAndWeather;
using MoreMountains.Tools;
using UnityEngine;

namespace Interaction
{
    /// <summary>
    /// Interactable that advances to the next in-game day (e.g. a bed).
    /// </summary>
    public class AdvanceDayInteractable : AbstractInteractable
    {
        protected override bool Interact(GameCharacter instigator)
        {
            UrTimeManager.Instance.EndDay();
            return true;
        }
    }
}
