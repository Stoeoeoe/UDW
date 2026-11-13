using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Core.Routines;
using MoonSharp.Interpreter;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor.AssetImporters;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>Imports *.routine.json into a <see cref="RoutineDefinition"/>. Cross-references are checked by the routine catalog.</summary>
    internal static class RoutineImporter
    {
        public static void ImportRoutine(AssetImportContext ctx)
        {
            var routine = Create(VulcanusSchema.Read<RoutineDto>(ctx), ctx.assetPath);
            routine.name = routine.RoutineId;
            ctx.AddObjectToAsset("routine", routine);
            ctx.SetMainObject(routine);
        }

        internal static RoutineDefinition Parse(string json, string schemaPath, string sourcePath) =>
            Create(VulcanusSchema.Deserialize<RoutineDto>(json, schemaPath, sourcePath), sourcePath);

        private static RoutineDefinition Create(RoutineDto data, string sourcePath)
        {
            var routine = ScriptableObject.CreateInstance<RoutineDefinition>();
            try
            {
                var home = Place(data.Home);
                routine.Configure(data.Id, data.Character, home,
                    Entries(data.Overrides, "overrides", sourcePath), Entries(data.Variants, "variants", sourcePath));
                return routine;
            }
            catch { Object.DestroyImmediate(routine); throw; }
        }

        private static RoutineEntry[] Entries(List<EntryDto> entries, string list, string sourcePath) =>
            (entries ?? new List<EntryDto>()).Select((entry, i) =>
            {
                var path = $"{list}[{i}]";
                return new RoutineEntry(entry.Id, Condition(entry.Condition, sourcePath, path),
                    entry.PickOne == null ? Goals(entry.Goals, sourcePath, path) : null,
                    entry.PickOne?.Select((choice, c) => new RoutineChoice(choice.Id,
                        Condition(choice.Condition, sourcePath, $"{path}.pickOne[{c}]"), choice.Weight ?? 1f,
                        Goals(choice.Goals, sourcePath, $"{path}.pickOne[{c}]"))).ToArray());
            }).ToArray();

        private static RoutineGoal[] Goals(List<GoalDto> goals, string sourcePath, string path) =>
            (goals ?? new List<GoalDto>()).Select((goal, i) => new RoutineGoal(goal.Id, Minutes(goal.DepartAt),
                Condition(goal.Condition, sourcePath, $"{path}.goals[{i}]"), Destination(goal.Destination),
                goal.Activity?.Animation)).ToArray();

        /// <summary>Null means the routine's home.</summary>
        private static RoutinePlace Destination(JToken destination) =>
            destination is JValue { Value: "home" } ? null : Place(destination.ToObject<PlaceDto>());

        private static RoutinePlace Place(PlaceDto place) => new(place.Map, place.Anchor);

        // The schema guarantees HH:MM.
        private static int Minutes(string time) =>
            int.Parse(time[..2], CultureInfo.InvariantCulture) * 60 + int.Parse(time[3..], CultureInfo.InvariantCulture);

        /// <summary>Rejects Lua syntax errors at import; the expression runs later against live state.</summary>
        private static string Condition(string condition, string sourcePath, string path)
        {
            if (condition == null) return null;
            try { new Script(CoreModules.Preset_HardSandbox).LoadString("return (" + condition + "\n)", null, path); }
            catch (InterpreterException error)
            {
                throw new FormatException($"{sourcePath}: {path}.condition is not a valid Lua expression: {error.DecoratedMessage ?? error.Message}");
            }
            return condition;
        }

        private sealed class RoutineDto
        {
            [JsonProperty("id")] public string Id;
            [JsonProperty("character")] public string Character;
            [JsonProperty("home")] public PlaceDto Home;
            [JsonProperty("overrides")] public List<EntryDto> Overrides;
            [JsonProperty("variants")] public List<EntryDto> Variants;
        }

        private sealed class EntryDto
        {
            [JsonProperty("id")] public string Id;
            [JsonProperty("condition")] public string Condition;
            [JsonProperty("goals")] public List<GoalDto> Goals;
            [JsonProperty("pickOne")] public List<ChoiceDto> PickOne;
        }

        private sealed class ChoiceDto
        {
            [JsonProperty("id")] public string Id;
            [JsonProperty("condition")] public string Condition;
            [JsonProperty("weight")] public float? Weight;
            [JsonProperty("goals")] public List<GoalDto> Goals;
        }

        private sealed class GoalDto
        {
            [JsonProperty("id")] public string Id;
            [JsonProperty("departAt")] public string DepartAt;
            [JsonProperty("condition")] public string Condition;
            [JsonProperty("destination")] public JToken Destination;
            [JsonProperty("activity")] public ActivityDto Activity;
        }

        private sealed class ActivityDto
        {
            [JsonProperty("animation")] public string Animation;
        }

        private sealed class PlaceDto
        {
            [JsonProperty("map")] public string Map;
            [JsonProperty("anchor")] public string Anchor;
        }
    }
}
