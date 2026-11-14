using System;
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

        public void Validate()
        {
            if (!(pauseAfterTalkingSeconds >= 0f) || !(maxDelayMinutes >= 0f))
                throw new InvalidOperationException("Routine settings require a pause and a delay of zero or more.");
        }
    }
}
