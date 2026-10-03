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
        protected override void Interact(GameCharacter instigator)
        {
            var timeManager = UrTimeManager.Instance;
            if (timeManager == null)
            {
                Debug.LogWarning("[AdvanceDayInteractable] No UrTimeManager found in scene.");
                return;
            }

            timeManager.StartNewDay();
        }
    }
}
