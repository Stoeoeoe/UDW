using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Core.Common.Editor;
using Core.Tile.Editor.Vulcanus;
using NUnit.Framework;

namespace Core.Routines.Editor
{
    public sealed class RoutinePlannerTests : GameTest
    {
        private const string Square = "{ map: 'base:map-1', anchor: 'fabia-destination' }";

        private RoutineDefinition Routine(string[] variants, string[] overrides = null, string dialogue = null) =>
            VulcanusJson.Populate(Game.Asset<RoutineDefinition>(),
                "{ id: 'base:fabia_routine', character: 'base:fabia', home: { map: 'base:map-1', anchor: 'right-sie' }" +
                Property("dialogue", dialogue) + $", variants: [{string.Join(",", variants)}]" +
                (overrides == null ? "" : $", overrides: [{string.Join(",", overrides)}]") + " }");

        private static string Goal(string id, int hour, string destination = "'home'", string condition = null,
            string activity = null, string walkingDialogue = null, string dialogue = null) =>
            $"{{ id: '{id}', departAt: '{hour:00}:00', destination: {destination}" + Property("condition", condition) +
            (activity == null ? "" : $", activity: {{ animation: '{activity}' }}") +
            Property("walkingDialogue", walkingDialogue) + Property("dialogue", dialogue) + " }";

        /// <summary>The goal with a dialogue property authored as an explicit null.</summary>
        private static string Silent(string goal, string property) => goal[..^1] + $", {property}: null }}";

        private static string Fixed(string id, string condition, params string[] goals) =>
            $"{{ id: '{id}'{Property("condition", condition)}, goals: [{string.Join(",", goals)}] }}";

        private static string Pool(string id, string condition, params string[] choices) =>
            $"{{ id: '{id}'{Property("condition", condition)}, pickOne: [{string.Join(",", choices)}] }}";

        private static string Choice(string id, float weight, string condition = null) =>
            $"{{ id: '{id}', weight: {weight.ToString(CultureInfo.InvariantCulture)}{Property("condition", condition)}, goals: [{Goal(id, 9, Square)}] }}";

        private static string Property(string name, string value) => value == null ? "" : $", {name}: \"{value}\"";

        private static readonly string[] StoryFlags = { "rain", "sun", "festival", "wedding", "hungry", "dry" };

        /// <summary>An authored condition that holds while the story flag is set.</summary>
        private static string Story(string flag) => $"GameState.Story.Has('{flag}')";

        /// <summary>A planner whose conditions run against game state with exactly these story flags set.</summary>
        private RoutinePlanner Planner(params string[] flags) => Planner(1234, flags);

        private RoutinePlanner Planner(int seed, params string[] flags)
        {
            var lua = Game.Lua.CreateEngine();
            foreach (var flag in StoryFlags) lua.Execute($"GameState.Story.Remove('{flag}')");
            foreach (var flag in flags) lua.Execute($"GameState.Story.Set('{flag}', true)");
            return new RoutinePlanner(lua, seed);
        }

        [Test]
        public void FabiasDayGoesOutAtEightAndHomeAtTen()
        {
            var routine = Routine(new[] { Fixed("default", null, Goal("visit", 8, Square, activity: "base:wave2"), Goal("back_home", 10)) });
            var plan = Planner().PlanDay(routine, 1);

            Assert.That(plan.ChoiceId, Is.EqualTo("default"));
            Assert.That(plan.Goals[1].Destination, Is.SameAs(routine.Home), "\"home\" resolves to the routine's home.");

            Assert.That(plan.Goals.Select(goal => (goal.Id, goal.DepartMinute)), Is.EqualTo(new[] { ("visit", 480), ("back_home", 600) }));
            Assert.That(plan.Goals[0].Destination.ToString(), Is.EqualTo("base:map-1/fabia-destination"));
            Assert.That(plan.Goals[0].ActivityAnimationId, Is.EqualTo("base:wave2"));
        }

        [Test]
        public void OverridesWinOverVariantsAndEachListIsFirstHit()
        {
            var routine = Routine(
                new[] { Fixed("rainy", Story("rain")), Fixed("sunny", Story("sun")), Fixed("default", null) },
                new[] { Fixed("festival", Story("festival")), Fixed("wedding", Story("wedding")) });

            Assert.That(Planner("rain", "festival", "wedding").PlanDay(routine, 1).ChoiceId, Is.EqualTo("festival"));
            Assert.That(Planner("rain", "sun").PlanDay(routine, 1).ChoiceId, Is.EqualTo("rainy"));
            Assert.That(Planner("sun").PlanDay(routine, 1).ChoiceId, Is.EqualTo("sunny"));
            Assert.That(Planner().PlanDay(routine, 1).ChoiceId, Is.EqualTo("default"));
        }

        [Test]
        public void GoalConditionsSkipGoalsForTheDay()
        {
            var routine = Routine(new[] { Fixed("default", null, Goal("lunch", 12, Square, Story("hungry")), Goal("back_home", 13)) });
            Assert.That(Planner("hungry").PlanDay(routine, 1).Goals.Select(goal => goal.Id), Is.EqualTo(new[] { "lunch", "back_home" }));
            var skipped = Planner().PlanDay(routine, 1);
            Assert.That(skipped.Goals.Select(goal => goal.Id), Is.EqualTo(new[] { "back_home" }));
        }

        [Test]
        public void APoolWithNoMatchingMemberFallsThrough()
        {
            var routine = Routine(new[] { Pool("summer", null, Choice("beach", 1, Story("dry")), Choice("lake", 1, Story("dry"))), Fixed("default", null) });
            Assert.That(Planner().PlanDay(routine, 1).ChoiceId, Is.EqualTo("default"));
            Assert.That(Planner("dry").PlanDay(routine, 1).ChoiceId, Is.EqualTo("beach").Or.EqualTo("lake"));
        }

        [Test]
        public void PoolChoicesAreStableForADayAndFollowTheirWeights()
        {
            var routine = Routine(new[] { Pool("summer", null, Choice("shop", 1), Choice("beach", 2), Choice("cliff", 0.2f)) });

            // The same character and day always plan the same way, so loading mid-day reproduces it.
            for (var day = 1; day <= 50; day++)
                Assert.That(Planner().PlanDay(routine, day).ChoiceId,
                    Is.EqualTo(Planner().PlanDay(routine, day).ChoiceId));

            const int days = 6000;
            var counts = new Dictionary<string, int> { ["shop"] = 0, ["beach"] = 0, ["cliff"] = 0 };
            var planner = Planner();
            for (var day = 1; day <= days; day++) counts[planner.PlanDay(routine, day).ChoiceId]++;
            Assert.That(counts["shop"] / (double)days, Is.EqualTo(1 / 3.2).Within(0.03));
            Assert.That(counts["beach"] / (double)days, Is.EqualTo(2 / 3.2).Within(0.03));
            Assert.That(counts["cliff"] / (double)days, Is.EqualTo(0.2 / 3.2).Within(0.02));
        }

        [Test]
        public void EachPlaythroughChoosesItsOwnDaysAndKeepsThem()
        {
            var routine = Routine(new[] { Pool("summer", null, Choice("shop", 1), Choice("beach", 1)) });
            string[] Days(int seed)
            {
                var planner = Planner(seed);
                return Enumerable.Range(1, 30).Select(day => planner.PlanDay(routine, day).ChoiceId).ToArray();
            }

            Assert.That(Days(1), Is.EqualTo(Days(1)), "The same playthrough plans the same days after loading.");
            Assert.That(Days(1), Is.Not.EqualTo(Days(2)), "Another playthrough chooses differently.");
        }

        [Test]
        public void DifferentCharactersRollDifferentlyOnTheSameDay()
        {
            var samples = Enumerable.Range(0, 20).Select(i => RoutinePlanner.DailySample(1234, $"base:npc_{i}", 7)).ToArray();
            Assert.That(samples.Distinct().Count(), Is.EqualTo(samples.Length));
            Assert.That(samples, Has.All.InRange(0.0, 1.0));
            Assert.That(samples.Max() - samples.Min(), Is.GreaterThan(0.5), "Similar IDs must still spread out.");
        }

        [Test]
        public void TheNewestDialogueOfTheDayIsInEffectAndUnsetPhasesKeepIt()
        {
            var routine = Routine(new[]
            {
                Fixed("default", null,
                    Goal("market", 8, Square, walkingDialogue: "base:hurrying", dialogue: "base:selling"),
                    Goal("lunch", 12, Square, Story("hungry"), dialogue: "base:eating"),
                    Goal("back_home", 14))
            }, dialogue: "base:morning");

            var hungry = Planner("hungry").PlanDay(routine, 1);
            Assert.That(hungry.DialogueAt(-1, arrived: true).Id, Is.EqualTo("base:morning"), "The routine's own dialogue starts the day.");
            Assert.That(hungry.DialogueAt(0, arrived: false).Id, Is.EqualTo("base:hurrying"));
            Assert.That(hungry.DialogueAt(0, arrived: true).Id, Is.EqualTo("base:selling"));
            Assert.That(hungry.DialogueAt(1, arrived: false).Id, Is.EqualTo("base:selling"), "Walking to lunch sets none, so selling stays.");
            Assert.That(hungry.DialogueAt(1, arrived: true).Id, Is.EqualTo("base:eating"));
            Assert.That(hungry.DialogueAt(2, arrived: true).Id, Is.EqualTo("base:eating"));

            // A skipped goal sets nothing, so its dialogue does not leak into the rest of the day.
            var full = Planner().PlanDay(routine, 1);
            Assert.That(full.Goals.Select(goal => goal.Id), Is.EqualTo(new[] { "market", "back_home" }));
            Assert.That(full.DialogueAt(1, arrived: true).Id, Is.EqualTo("base:selling"));

            var silent = Planner().PlanDay(Routine(new[] { Fixed("default", null, Goal("visit", 9, Square)) }), 1);
            Assert.That(silent.DialogueAt(0, arrived: true).IsSet, Is.False, "A day that sets none leaves the character's own dialogues.");
        }

        [Test]
        public void ANullDialogueIsNothingToSayAndDiffersFromOneThatIsNotSet()
        {
            var routine = Routine(new[]
            {
                Fixed("default", null,
                    Silent(Goal("market", 8, Square, dialogue: "base:selling"), "walkingDialogue"),
                    Silent(Goal("rest", 12, Square), "dialogue"),
                    Goal("back_home", 14))
            }, dialogue: "base:morning");

            var day = Planner().PlanDay(routine, 1);
            Assert.That(day.DialogueAt(0, arrived: false).Silent, Is.True, "Walking to the market has nothing to say.");
            Assert.That(day.DialogueAt(0, arrived: true).Id, Is.EqualTo("base:selling"));
            var resting = day.DialogueAt(1, arrived: true);
            Assert.That(resting.Silent, Is.True, "Resting has nothing to say, which replaces the market's dialogue.");
            Assert.That(resting.Id, Is.Null);
            Assert.That(day.DialogueAt(2, arrived: false).Silent, Is.True, "Not set, so the silence stays.");
        }
    }
}
