using System;
using System.Collections.Generic;
using System.Linq;
using Core.Common.Editor;
using NUnit.Framework;

namespace Core.Routines.Editor
{
    public sealed class RoutinePlannerTests : GameTest
    {
        private static readonly RoutinePlace Home = new("base:map-1", "right-sie");
        private static readonly RoutinePlace Square = new("base:map-1", "fabia-destination");

        private RoutineDefinition Routine(RoutineEntry[] variants, RoutineEntry[] overrides = null, string dialogue = null)
        {
            var routine = Game.Asset<RoutineDefinition>();
            routine.Configure("base:fabia_routine", "base:fabia", Home, overrides, variants, dialogue);
            return routine;
        }

        private static RoutineGoal Goal(string id, int hour, RoutinePlace destination = null, string condition = null,
            string activity = null) => new(id, hour * 60, condition, destination, activity);

        private static RoutineEntry Fixed(string id, string condition, params RoutineGoal[] goals) => new(id, condition, goals, null);

        private static RoutineEntry Pool(string id, string condition, params RoutineChoice[] choices) => new(id, condition, null, choices);

        private static RoutineChoice Choice(string id, float weight, string condition = null) =>
            new(id, condition, weight, new[] { Goal(id, 9, Square) });

        private static readonly string[] StoryFlags = { "rain", "sun", "festival", "wedding", "hungry", "dry" };

        /// <summary>An authored condition that holds while the story flag is set.</summary>
        private static string Story(string flag) => $"GameState.Story.Has('{flag}')";

        /// <summary>A planner whose conditions run against game state with exactly these story flags set.</summary>
        private RoutinePlanner Planner(params string[] flags)
        {
            var lua = Game.Lua.CreateEngine();
            foreach (var flag in StoryFlags) lua.Execute($"GameState.Story.Remove('{flag}')");
            foreach (var flag in flags) lua.Execute($"GameState.Story.Set('{flag}', true)");
            return new RoutinePlanner(lua);
        }

        [Test]
        public void FabiasDayGoesOutAtEightAndHomeAtTen()
        {
            var routine = Routine(new[] { Fixed("default", null, Goal("visit", 8, Square, activity: "base:wave2"), Goal("back_home", 10)) });
            var plan = Planner().PlanDay(routine, 1);

            Assert.That(plan.ChoiceId, Is.EqualTo("default"));
            Assert.That(plan.Goals[1].Destination, Is.SameAs(routine.Home), "\"home\" resolves to the routine's home.");

            var early = plan.At(7 * 60 + 30);
            Assert.That(early.IsHome, Is.True);
            Assert.That(early.From, Is.SameAs(routine.Home));

            var visiting = plan.At(9 * 60);
            Assert.That(visiting.Goal.Id, Is.EqualTo("visit"));
            Assert.That(visiting.From, Is.SameAs(routine.Home));
            Assert.That(visiting.MinutesSinceDeparture, Is.EqualTo(60));
            Assert.That(visiting.Goal.ActivityAnimationId, Is.EqualTo("base:wave2"));

            var exactly = plan.At(10 * 60);
            Assert.That(exactly.Goal.Id, Is.EqualTo("back_home"), "A goal starts at its departure minute.");
            Assert.That(exactly.From.AnchorId, Is.EqualTo("fabia-destination"));
            Assert.That(exactly.MinutesSinceDeparture, Is.EqualTo(0));

            Assert.That(plan.At(23 * 60).Goal.Id, Is.EqualTo("back_home"), "After the last departure she stays put.");
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
            Assert.That(skipped.At(12 * 60 + 30).IsHome, Is.True);
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
        public void DifferentCharactersRollDifferentlyOnTheSameDay()
        {
            var samples = Enumerable.Range(0, 20).Select(i => RoutinePlanner.DailySample($"base:npc_{i}", 7)).ToArray();
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
                    new RoutineGoal("market", 8 * 60, null, Square, null, walkingDialogueId: "base:hurrying", dialogueId: "base:selling"),
                    new RoutineGoal("lunch", 12 * 60, Story("hungry"), Square, null, dialogueId: "base:eating"),
                    new RoutineGoal("back_home", 14 * 60, null, null, null))
            }, dialogue: "base:morning");

            var hungry = Planner("hungry").PlanDay(routine, 1);
            Assert.That(hungry.DialogueAt(-1, arrived: true), Is.EqualTo("base:morning"), "The routine's own dialogue starts the day.");
            Assert.That(hungry.DialogueAt(0, arrived: false), Is.EqualTo("base:hurrying"));
            Assert.That(hungry.DialogueAt(0, arrived: true), Is.EqualTo("base:selling"));
            Assert.That(hungry.DialogueAt(1, arrived: false), Is.EqualTo("base:selling"), "Walking to lunch sets none, so selling stays.");
            Assert.That(hungry.DialogueAt(1, arrived: true), Is.EqualTo("base:eating"));
            Assert.That(hungry.DialogueAt(2, arrived: true), Is.EqualTo("base:eating"));

            // A skipped goal sets nothing, so its dialogue does not leak into the rest of the day.
            var full = Planner().PlanDay(routine, 1);
            Assert.That(full.Goals.Select(goal => goal.Id), Is.EqualTo(new[] { "market", "back_home" }));
            Assert.That(full.DialogueAt(1, arrived: true), Is.EqualTo("base:selling"));

            var silent = Planner().PlanDay(Routine(new[] { Fixed("default", null, Goal("visit", 9, Square)) }), 1);
            Assert.That(silent.DialogueAt(0, arrived: true), Is.Null, "Without any dialogue the character cannot be talked to.");
        }

        [Test]
        public void TimesOutsideTheDayAreRejected()
        {
            var plan = Planner().PlanDay(Routine(new[] { Fixed("default", null) }), 1);
            Assert.Throws<ArgumentOutOfRangeException>(() => plan.At(-1));
            Assert.Throws<ArgumentOutOfRangeException>(() => plan.At(24 * 60));
        }
    }
}
