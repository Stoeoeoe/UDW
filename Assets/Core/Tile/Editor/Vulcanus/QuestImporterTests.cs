using System;
using Core.Quests;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor.Vulcanus
{
    public sealed class QuestImporterTests
    {
        private const string SchemaPath = "Assets/Vulcan/0204project/schemas/quest.schema.json";
        private const string Id = "base:festival_wine";

        private static JObject Objective(string id, string kind, JObject fields)
        {
            var objective = new JObject { ["id"] = id, ["kind"] = kind, ["text"] = $"Objective {id}" };
            objective.Merge(fields);
            return objective;
        }

        private static JObject Quest(params JObject[] steps) => new()
        {
            ["formatVersion"] = 1,
            ["id"] = Id,
            ["title"] = "Wine for the festival",
            ["description"] = "The priestess needs wine for the offering.",
            ["giver"] = "base:fabia",
            ["onComplete"] = "Wallet.AddMoney(50)",
            ["steps"] = new JArray(steps)
        };

        private static JObject Step(string id, params JObject[] objectives) => new()
        {
            ["id"] = id,
            ["journal"] = $"Step {id}",
            ["objectives"] = new JArray(objectives)
        };

        private static QuestDefinition Parse(JObject quest, JObject i18n = null) =>
            QuestImporter.Parse(quest.ToString(), SchemaPath, "quest-test.json", i18n?.ToString());

        [Test]
        public void ImportsStepsWithEveryKindOfObjective()
        {
            var buy = Step("buy",
                Objective("ask", "talk", new JObject { ["character"] = "base:fabia", ["dialogue"] = "base:fabia_greeting" }),
                Objective("carry", "have", new JObject { ["item"] = "base:wine", ["count"] = 2 }));
            buy["deadline"] = new JObject { ["days"] = 2, ["at"] = "18:30" };
            buy["failWhen"] = "GameState.Story.Has('festival_over')";
            var bring = Step("bring",
                Objective("go", "reach", new JObject { ["map"] = "base:map-1", ["trigger"] = "temple" }),
                Objective("give", "deliver", new JObject { ["character"] = "base:fabia", ["item"] = "base:wine", ["count"] = 2 }),
                Objective("pray", "condition", new JObject { ["condition"] = "DivineFavour.GetFavour('base:ceres') > 10" }));
            var quest = Parse(Quest(buy, bring));
            try
            {
                Assert.That(quest.QuestId, Is.EqualTo(Id));
                Assert.That(quest.GiverId, Is.EqualTo("base:fabia"));
                Assert.That(quest.OnComplete, Is.EqualTo("Wallet.AddMoney(50)"));
                Assert.That(quest.Steps, Has.Length.EqualTo(2));

                var first = quest.Steps[0];
                Assert.That((first.HasDeadline, first.DeadlineDays, first.DeadlineMinute), Is.EqualTo((true, 2, 18 * 60 + 30)));
                Assert.That(first.FailWhen, Is.EqualTo("GameState.Story.Has('festival_over')"));
                var ask = first.Objectives[0];
                Assert.That((ask.Kind, ask.CharacterId, ask.DialogueId), Is.EqualTo((QuestObjectiveKind.Talk, "base:fabia", "base:fabia_greeting")));
                Assert.That((first.Objectives[1].Kind, first.Objectives[1].ItemId, first.Objectives[1].Count),
                    Is.EqualTo((QuestObjectiveKind.Have, "base:wine", 2)));

                var second = quest.Steps[1];
                Assert.That(second.HasDeadline, Is.False);
                Assert.That((second.Objectives[0].Kind, second.Objectives[0].MapId, second.Objectives[0].TriggerId),
                    Is.EqualTo((QuestObjectiveKind.Reach, "base:map-1", "temple")));
                Assert.That((second.Objectives[1].Kind, second.Objectives[1].CharacterId, second.Objectives[1].Count),
                    Is.EqualTo((QuestObjectiveKind.Deliver, "base:fabia", 2)));
                Assert.That(second.Objectives[2].Condition, Is.EqualTo("DivineFavour.GetFavour('base:ceres') > 10"));
                Assert.That(quest.ValidateConfiguration(), Is.Empty);
            }
            finally { Object.DestroyImmediate(quest); }
        }

        [Test]
        public void TextsAreTranslatedThroughKeysDerivedFromTheIds()
        {
            JObject Message(string key, string text) => new() { ["msgKey"] = key, ["text"] = text };
            var i18n = new JObject
            {
                ["questId"] = Id,
                ["messages"] = new JArray(
                    Message($"quest.{Id}.title", "Vinum für das Fest"),
                    Message($"quest.{Id}.buy.journal", "Kaufe Wein."),
                    Message($"quest.{Id}.buy.carry.text", "Wein"))
            };
            var quest = Parse(Quest(Step("buy", Objective("carry", "have", new JObject { ["item"] = "base:wine", ["count"] = 1 }))), i18n);
            try
            {
                var step = quest.Steps[0];
                Assert.That(quest.Title, Is.EqualTo("Vinum für das Fest"));
                Assert.That(quest.Journal(step), Is.EqualTo("Kaufe Wein."));
                Assert.That(quest.Text(step, step.Objectives[0]), Is.EqualTo("Wein"));
                Assert.That(quest.Description, Is.EqualTo("The priestess needs wine for the offering."),
                    "Texts the i18n file lacks use the quest's own text.");
            }
            finally { Object.DestroyImmediate(quest); }
        }

        [Test]
        public void TheSchemaRequiresEachObjectivesFields()
        {
            var deliverWithoutCount = Objective("give", "deliver", new JObject { ["character"] = "base:fabia", ["item"] = "base:wine" });
            Assert.That(() => Parse(Quest(Step("bring", deliverWithoutCount))),
                Throws.TypeOf<FormatException>().With.Message.Contains("schema validation failed"));
            Assert.That(() => Parse(Quest(Step("empty"))), Throws.TypeOf<FormatException>(), "A step needs an objective.");
        }

        [Test]
        public void LuaMustParse()
        {
            var badCondition = Objective("pray", "condition", new JObject { ["condition"] = "DivineFavour.GetFavour(" });
            Assert.That(() => Parse(Quest(Step("pray", badCondition))),
                Throws.TypeOf<FormatException>().With.Message.Contains("steps[0].objectives[0].condition is not a valid Lua expression"));

            var quest = Quest(Step("buy", Objective("carry", "have", new JObject { ["item"] = "base:wine", ["count"] = 1 })));
            quest["onStart"] = "Wallet.AddMoney(";
            Assert.That(() => Parse(quest), Throws.TypeOf<FormatException>().With.Message.Contains("onStart is not valid Lua"));
        }

        [Test]
        public void StepAndObjectiveIdsMustBeUnique()
        {
            var carry = Objective("carry", "have", new JObject { ["item"] = "base:wine", ["count"] = 1 });
            Assert.That(() => Parse(Quest(Step("buy", carry), Step("buy", (JObject)carry.DeepClone()))),
                Throws.ArgumentException.With.Message.Contains("steps[1].Id: 'buy' is used more than once"));
            Assert.That(() => Parse(Quest(Step("buy", carry, (JObject)carry.DeepClone()))),
                Throws.ArgumentException.With.Message.Contains("steps[0].objectives[1].Id: 'carry' is used more than once"));
        }
    }
}
