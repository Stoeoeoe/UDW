using System;
using System.Linq;
using Unity.Pipeline.Commands;
using UnityEditor;
using UnityEngine;

namespace Core.TimeAndWeather.Editor
{
    public static class WeatherCommands
    {
        // Asset discovery stays editor-only; the command uses the normal gameplay weather path.
        private static WeatherData[] FindWeather() => AssetDatabase.FindAssets("t:WeatherData", new[] { "Assets" })
            .Select(guid => AssetDatabase.LoadAssetAtPath<WeatherData>(AssetDatabase.GUIDToAssetPath(guid)))
            .Where(weather => weather)
            .OrderBy(weather => weather.id, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        [CliCommand("list_weather", "List authored weather IDs and the active Play mode weather", MainThreadRequired = true)]
        public static object ListWeather()
        {
            var manager = EditorApplication.isPlaying ? UnityEngine.Object.FindFirstObjectByType<WeatherManager>() : null;
            return new
            {
                playing = EditorApplication.isPlaying,
                current = manager && manager.CurrentWeather ? manager.CurrentWeather.id : null,
                available = FindWeather().Select(weather => new
                {
                    id = weather.id, label = weather.label, asset = AssetDatabase.GetAssetPath(weather)
                }).ToArray()
            };
        }

        [CliCommand("set_weather", "Change weather in the running game (until the next normal weather roll)", MainThreadRequired = true)]
        public static object SetWeather([CliArg("weather", "Weather ID, label, or asset name (see list_weather)", Required = true)] string weather)
        {
            if (!EditorApplication.isPlaying)
                throw new InvalidOperationException("Start the game in Play mode before using set_weather.");
            var manager = UnityEngine.Object.FindFirstObjectByType<WeatherManager>();
            if (!manager) throw new InvalidOperationException("No active WeatherManager was found in the running game.");
            if (string.IsNullOrWhiteSpace(weather)) throw new ArgumentException("Provide a weather ID from list_weather.");

            var key = weather.Trim();
            var matches = FindWeather().Where(candidate =>
                string.Equals(candidate.id, key, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(candidate.label, key, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(candidate.name, key, StringComparison.OrdinalIgnoreCase)).ToArray();
            if (matches.Length != 1)
                throw new ArgumentException(matches.Length == 0
                    ? $"Unknown weather '{key}'. Use list_weather to see available IDs."
                    : $"Weather '{key}' matches multiple assets. Give each weather a unique ID and use that ID.");

            var previous = manager.CurrentWeather ? manager.CurrentWeather.id : null;
            manager.SetWeather(matches[0]);
            return new { previous, current = manager.CurrentWeather.id, presentation = "Weather notifications and daylight refresh on the next frame." };
        }
    }
}
