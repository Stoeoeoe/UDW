using System;
using UnityEngine;

namespace Core.Quests
{
    /// <summary>How quests show in the world, for all of them. Serialized on the SystemRoot.</summary>
    [Serializable]
    public sealed class QuestSettings
    {
        [Tooltip("Shown above a character who has something for an active quest.")]
        public Sprite markIcon;

        [Tooltip("Where the mark sits, relative to the character's graphics, in world units.")]
        public Vector2 markOffset = new(0f, 1.75f);

        public void Validate()
        {
            if (!markIcon) throw new InvalidOperationException("Quest settings require the quest mark icon.");
        }
    }
}
