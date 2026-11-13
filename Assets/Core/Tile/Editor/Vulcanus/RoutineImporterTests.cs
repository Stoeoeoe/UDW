using System;
using Core.Common.Editor;
using Core.Routines;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor.Vulcanus
{
    public sealed class RoutineImporterTests : GameTest
    {
        private const string SchemaPath = "Assets/Vulcan/0204project/schemas/routine.schema.json";

        private static RoutineDefinition Parse(JObject json) =>
            RoutineImporter.Parse(json.ToString(), SchemaPath, "routine-test.json");

        private static JObject Routine(JArray variants, JArray overrides = null)
        {
            var json = new JObject
            {
                ["formatVersion"] = 1,
                ["id"] = "base:fabia_routine",
                ["character"] = "base:fabia",
                ["home"] = new JObject { ["map"] = "base:map-1", ["anchor"] = "right-sie" },
                ["variants"] = variants
            };
            if (overrides != null) json["overrides"] = overrides;
            return json;
        }

        private static JObject Goal(string id, string departAt, object destination = null) => new()
        {
            ["id"] = id,
            ["departAt"] = departAt,
            ["destination"] = destination == null ? new JObject { ["map"] = "base:map-1", ["anchor"] = "fabia-destination" } : JToken.FromObject(destination)
        };

        private static JObject Entry(string id, string condition, params JObject[] goals)
        {
            var entry = new JObject { ["id"] = id, ["goals"] = new JArray(goals) };
            if (condition != null) entry["condition"] = condition;
            return entry;
        }

        [Test]
        public void ImportsFabiasExampleDay()
        {
            var visit = Goal("visit", "08:00");
            visit["activity"] = new JObject { ["animation"] = "base:wave2" };
            var routine = Parse(Routine(new JArray(Entry("default", null, visit, Goal("back_home", "10:00", "home")))));
            try
            {
                Assert.That(routine.RoutineId, Is.EqualTo("base:fabia_routine"));
                Assert.That(routine.CharacterId, Is.EqualTo("base:fabia"));
                Assert.That(routine.Home.ToString(), Is.EqualTo("base:map-1/right-sie"));
                var goals = routine.Variants[0].Goals;
                Assert.That(goals[0].DepartMinute, Is.EqualTo(8 * 60));
                Assert.That(goals[0].Destination.AnchorId, Is.EqualTo("fabia-destination"));
                Assert.That(goals[0].ActivityAnimationId, Is.EqualTo("base:wave2"));
                Assert.That(goals[1].DepartMinute, Is.EqualTo(10 * 60));
                Assert.That(goals[1].ToHome, Is.True);
                Assert.That(goals[1].Destination, Is.Null);
                Assert.That(routine.ValidateConfiguration(), Is.Empty);
            }
            finally { Object.DestroyImmediate(routine); }
        }

        [Test]
        public void ImportsWhatTheCharacterSaysThroughTheDay()
        {
            var visit = Goal("visit", "08:00");
            visit["walkingDialogue"] = "base:hurrying";
            visit["dialogue"] = "base:fabia_greeting";
            var json = Routine(new JArray(Entry("default", null, visit, Goal("back_home", "10:00", "home"))));
            json["dialogue"] = "base:morning";
            var routine = Parse(json);
            try
            {
                Assert.That(routine.DialogueId, Is.EqualTo("base:morning"));
                Assert.That(routine.Variants[0].Goals[0].WalkingDialogueId, Is.EqualTo("base:hurrying"));
                Assert.That(routine.Variants[0].Goals[0].DialogueId, Is.EqualTo("base:fabia_greeting"));
                Assert.That(routine.Variants[0].Goals[1].DialogueId, Is.Empty, "An unset dialogue keeps the one before.");
            }
            finally { Object.DestroyImmediate(routine); }

            json["dialogue"] = "Fabia Greeting";
            Assert.Throws<FormatException>(() => Parse(json), "Dialogue IDs are namespaced.");
        }

        [Test]
        public void ImportsPoolsWithDefaultWeights()
        {
            var pool = new JObject
            {
                ["id"] = "summer",
                ["condition"] = "Time.GetCurrent().season == 'Summer'",
                ["pickOne"] = new JArray(
                    new JObject { ["id"] = "beach", ["weight"] = 2, ["goals"] = new JArray(Goal("go", "09:00")) },
                    new JObject { ["id"] = "shop", ["goals"] = new JArray() })
            };
            var routine = Parse(Routine(new JArray(pool, Entry("default", null))));
            try
            {
                Assert.That(routine.Variants[0].IsPool, Is.True);
                Assert.That(routine.Variants[0].PickOne[0].Weight, Is.EqualTo(2f));
                Assert.That(routine.Variants[0].PickOne[1].Weight, Is.EqualTo(1f));
                Assert.That(routine.Variants[1].IsPool, Is.False);
            }
            finally { Object.DestroyImmediate(routine); }
        }

        [TestCase("8:00")]
        [TestCase("24:00")]
        [TestCase("08:60")]
        [TestCase("noon")]
        public void DepartureTimesMustBeHoursAndMinutes(string time) =>
            Assert.Throws<FormatException>(() => Parse(Routine(new JArray(Entry("default", null, Goal("visit", time))))));

        [Test]
        public void AnEntryHasGoalsOrAPoolButNotBoth()
        {
            var both = Entry("default", null);
            both["pickOne"] = new JArray(new JObject { ["id"] = "a", ["goals"] = new JArray() });
            Assert.Throws<FormatException>(() => Parse(Routine(new JArray(both))));
            Assert.Throws<FormatException>(() => Parse(Routine(new JArray(new JObject { ["id"] = "default" }))));
        }

        [Test]
        public void UnknownDestinationsAndPropertiesAreRejectedBySchema()
        {
            Assert.Throws<FormatException>(() => Parse(Routine(new JArray(Entry("default", null, Goal("visit", "08:00", "work"))))));
            var json = Routine(new JArray(Entry("default", null)));
            json["schedule"] = "daily";
            Assert.Throws<FormatException>(() => Parse(json));
        }

        [Test]
        public void ConditionsMustBeValidLua()
        {
            var error = Assert.Throws<FormatException>(() =>
                Parse(Routine(new JArray(Entry("rainy", "Weather.IsRaining(", Goal("visit", "08:00")), Entry("default", null)))));
            Assert.That(error.Message, Does.Contain("variants[0].condition"));
        }

        [Test]
        public void GoalsMustDepartInOrder() =>
            Assert.Throws<ArgumentException>(() =>
                Parse(Routine(new JArray(Entry("default", null, Goal("late", "10:00"), Goal("early", "09:00"))))));

        [Test]
        public void EveryDayNeedsAVariantWithoutCondition()
        {
            var error = Assert.Throws<ArgumentException>(() => Parse(Routine(new JArray(Entry("rainy", "Weather.IsRaining()")))));
            Assert.That(error.Message, Does.Contain("needs no condition"));

            // A pool whose members all have conditions can be skipped, so it does not count as the fallback.
            var pool = new JObject
            {
                ["id"] = "maybe",
                ["pickOne"] = new JArray(new JObject { ["id"] = "a", ["condition"] = "false", ["goals"] = new JArray() })
            };
            Assert.Throws<ArgumentException>(() => Parse(Routine(new JArray(pool))));
        }

        [Test]
        public void EntriesAfterTheFallbackAreUnreachable()
        {
            var error = Assert.Throws<ArgumentException>(() =>
                Parse(Routine(new JArray(Entry("default", null), Entry("rainy", "Weather.IsRaining()")))));
            Assert.That(error.Message, Does.Contain("'rainy' can never be chosen"));
        }

        [Test]
        public void OverridesNeedAConditionAndIdsAreUnique()
        {
            Assert.Throws<ArgumentException>(() =>
                Parse(Routine(new JArray(Entry("default", null)), new JArray(Entry("festival", null)))));
            Assert.Throws<ArgumentException>(() =>
                Parse(Routine(new JArray(Entry("default", null)), new JArray(Entry("default", "true")))));
            Assert.Throws<ArgumentException>(() =>
                Parse(Routine(new JArray(Entry("default", null, Goal("visit", "08:00"), Goal("visit", "09:00"))))));
        }
    }
}
