using System;
using Unity.Pipeline.Commands;
using UnityEditor;
using Object = UnityEngine.Object;

namespace Core.TimeAndWeather.Editor
{
    public static class DayCommands
    {
        [CliCommand("sleep_here", "Sleep through the night in the running game and wake up at the player's current position", MainThreadRequired = true)]
        public static object SleepHere()
        {
            if (!EditorApplication.isPlaying)
                throw new InvalidOperationException("Start the game in Play mode before using sleep_here.");
            var overnight = Object.FindFirstObjectByType<OvernightTransition>();
            if (!overnight) throw new InvalidOperationException("No active OvernightTransition was found in the running game.");
            if (overnight.IsRunning) throw new InvalidOperationException("An overnight transition is already running.");

            overnight.EndDay(stayInPlace: true);
            return new { started = overnight.IsRunning, presentation = "Fades out, advances the day, and fades back in at the same position." };
        }
    }
}
