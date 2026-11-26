using System;
using Character.Animations;
using UnityEngine;

namespace Core.Routines
{
    /// <summary>How routine characters react to the player, for all of them. Serialized on the SystemRoot.</summary>
    [Serializable]
    public sealed class RoutineSettings
    {
        [Tooltip("Real seconds a routine character stays put after a conversation before going on with their day.")]
        public float pauseAfterTalkingSeconds = 3f;

        [Tooltip("In-game minutes a routine character may fall behind their timetable; after that, they move on and can't be talked to until they catch up.")]
        public float maxDelayMinutes = 20f;

        [Tooltip("Shown above a routine character who finds every slot of their goal's entity taken, while they wait for one to be free.")]
        public EmoteDefinition impatientEmote;

        [Tooltip("Real seconds between a waiting routine character's looks for a free slot.")]
        public float slotRetrySeconds = 1f;

        public void Validate()
        {
            if (!(pauseAfterTalkingSeconds >= 0f) || !(maxDelayMinutes >= 0f))
                throw new InvalidOperationException("Routine settings require a pause and a delay of zero or more.");
            if (!impatientEmote || !(slotRetrySeconds > 0f))
                throw new InvalidOperationException("Routine settings require an impatient emote and a positive slot retry time.");
        }
    }
}
