using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Core.Quests;
using MoonSharp.Interpreter;
using Newtonsoft.Json;
using UnityEditor.AssetImporters;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>
    /// Imports *.quest.json, with the texts of its sibling <c>.i18n.json</c>, into a <see cref="QuestDefinition"/>.
    /// Cross-references are checked by the quest catalog.
    /// </summary>
    internal static class QuestImporter
    {
        private const string Extension = ".quest.json";
        private const string I18nSchemaFile = "quest-i18n.schema.json";

        public static void ImportQuest(AssetImportContext ctx)
        {
            var quest = VulcanusSchema.Read<QuestDto>(ctx);
            var i18nPath = SiblingI18nPath(ctx.assetPath);
            I18nDto i18n = null;
            if (i18nPath != null)
            {
                VulcanusImportHelpers.AddDependency(ctx, i18nPath);
                i18n = VulcanusSchema.Read<I18nDto>(i18nPath);
            }
            var definition = Create(quest, i18n, ctx.assetPath);
            definition.name = definition.QuestId;
            ctx.AddObjectToAsset("quest", definition);
            ctx.SetMainObject(definition);
        }

        /// <param name="i18nJson">The quest's i18n file, or null without one.</param>
        internal static QuestDefinition Parse(string json, string schemaPath, string sourcePath, string i18nJson = null)
        {
            var i18n = i18nJson == null ? null
                : VulcanusSchema.Deserialize<I18nDto>(i18nJson, Path.Combine(Path.GetDirectoryName(schemaPath), I18nSchemaFile), sourcePath);
            return Create(VulcanusSchema.Deserialize<QuestDto>(json, schemaPath, sourcePath), i18n, sourcePath);
        }

        private static QuestDefinition Create(QuestDto data, I18nDto i18n, string sourcePath)
        {
            var definition = ScriptableObject.CreateInstance<QuestDefinition>();
            try
            {
                var steps = data.Steps.Select((step, s) => Step(step, sourcePath, $"steps[{s}]")).ToArray();
                var messages = (i18n?.Messages ?? new List<MessageDto>())
                    .Select(message => new QuestDefinition.Message { msgKey = message.MsgKey, text = message.Text }).ToArray();
                definition.Configure(data.Id, data.Title, data.Description, data.Giver, steps,
                    Actions(data.OnStart, sourcePath, "onStart"), Actions(data.OnComplete, sourcePath, "onComplete"),
                    Actions(data.OnFail, sourcePath, "onFail"), messages);
                return definition;
            }
            catch { Object.DestroyImmediate(definition); throw; }
        }

        private static QuestStep Step(StepDto step, string sourcePath, string path)
        {
            var objectives = step.Objectives.Select((objective, o) => Objective(objective, sourcePath, $"{path}.objectives[{o}]")).ToArray();
            var result = new QuestStep(step.Id, step.Journal, objectives,
                Condition(step.FailWhen, sourcePath, $"{path}.failWhen"), Actions(step.OnComplete, sourcePath, $"{path}.onComplete"));
            return step.Deadline == null ? result : result.WithDeadline(step.Deadline.Days, Minutes(step.Deadline.At));
        }

        // The schema guarantees each kind's required fields.
        private static QuestObjective Objective(ObjectiveDto objective, string sourcePath, string path) => objective.Kind switch
        {
            "talk" => QuestObjective.Talk(objective.Id, objective.Text, objective.Character, objective.Dialogue),
            "deliver" => QuestObjective.Deliver(objective.Id, objective.Text, objective.Character, objective.Item,
                objective.Count, objective.Dialogue),
            "have" => QuestObjective.Have(objective.Id, objective.Text, objective.Item, objective.Count),
            "reach" => QuestObjective.Reach(objective.Id, objective.Text, objective.Map, objective.Trigger),
            "condition" => QuestObjective.WhenTrue(objective.Id, objective.Text,
                Condition(objective.Condition, sourcePath, $"{path}.condition")),
            _ => throw new FormatException($"{sourcePath}: {path} has the unknown kind '{objective.Kind}'.")
        };

        // The schema guarantees HH:MM.
        private static int? Minutes(string time) => time == null ? null
            : int.Parse(time[..2], CultureInfo.InvariantCulture) * 60 + int.Parse(time[3..], CultureInfo.InvariantCulture);

        /// <summary>Rejects Lua syntax errors at import; the expression runs later against live state.</summary>
        private static string Condition(string condition, string sourcePath, string path) =>
            condition == null ? null : CheckLua("return (" + condition + "\n)", condition, sourcePath, path, "a valid Lua expression");

        private static string Actions(string lua, string sourcePath, string path) =>
            lua == null ? null : CheckLua(lua, lua, sourcePath, path, "valid Lua");

        private static string CheckLua(string chunk, string source, string sourcePath, string path, string expected)
        {
            try { new Script(CoreModules.Preset_HardSandbox).LoadString(chunk, null, path); }
            catch (InterpreterException error)
            {
                throw new FormatException($"{sourcePath}: {path} is not {expected}: {error.DecoratedMessage ?? error.Message}");
            }
            return source;
        }

        /// <summary>The quest's texts: &lt;name&gt;.i18n.json next to &lt;name&gt;.quest.json, or null without one.</summary>
        private static string SiblingI18nPath(string questPath)
        {
            var i18nPath = questPath[..^Extension.Length] + ".i18n.json";
            return File.Exists(VulcanusImportHelpers.ToAbsolutePath(i18nPath)) ? i18nPath : null;
        }

        private sealed class QuestDto
        {
            [JsonProperty("id")] public string Id;
            [JsonProperty("title")] public string Title;
            [JsonProperty("description")] public string Description;
            [JsonProperty("giver")] public string Giver;
            [JsonProperty("onStart")] public string OnStart;
            [JsonProperty("onComplete")] public string OnComplete;
            [JsonProperty("onFail")] public string OnFail;
            [JsonProperty("steps")] public List<StepDto> Steps;
        }

        private sealed class StepDto
        {
            [JsonProperty("id")] public string Id;
            [JsonProperty("journal")] public string Journal;
            [JsonProperty("objectives")] public List<ObjectiveDto> Objectives;
            [JsonProperty("deadline")] public DeadlineDto Deadline;
            [JsonProperty("failWhen")] public string FailWhen;
            [JsonProperty("onComplete")] public string OnComplete;
        }

        private sealed class DeadlineDto
        {
            [JsonProperty("days")] public int Days;
            [JsonProperty("at")] public string At;
        }

        private sealed class ObjectiveDto
        {
            [JsonProperty("id")] public string Id;
            [JsonProperty("kind")] public string Kind;
            [JsonProperty("text")] public string Text;
            [JsonProperty("character")] public string Character;
            [JsonProperty("dialogue")] public string Dialogue;
            [JsonProperty("item")] public string Item;
            [JsonProperty("count")] public int Count;
            [JsonProperty("map")] public string Map;
            [JsonProperty("trigger")] public string Trigger;
            [JsonProperty("condition")] public string Condition;
        }

        private sealed class I18nDto
        {
            [JsonProperty("messages")] public List<MessageDto> Messages;
        }

        private sealed class MessageDto
        {
            [JsonProperty("msgKey")] public string MsgKey;
            [JsonProperty("text")] public string Text;
        }
    }
}
