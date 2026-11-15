using Core.Common.Editor;
using Core.Tile.Editor.Vulcanus;
using Core.TimeAndWeather;
using NUnit.Framework;

namespace Core.Quests.Editor
{
    /// <summary>Deadlines and fail conditions end a quest as failed.</summary>
    public sealed class QuestFailureTests : GameTest
    {
        private QuestService _quests;

        /// <summary>Starts a quest on day 1 at 10:00 whose only step has the given deadline and fail condition.</summary>
        private void Quest(string stepRules)
        {
            Game.Catalog<QuestCatalog>(VulcanusJson.Populate(Game.Asset<QuestDefinition>(),
                "{ id: 'test:quest', onFail: \"GameState.Story.Set('test:failed', true)\", steps: [{ id: 'first', " + stepRules +
                ", objectives: [{ id: 'never', kind: 'condition', condition: 'false' }] }] }"));
            Game.CreatePlayer();
            _quests = Game.Get<QuestService>();
            At(day: 1, hour: 10, minute: 0);
            _quests.Start("test:quest");
        }

        private void At(int day, int hour, int minute)
        {
            Game.State.Time.daysSinceStart = day;
            Game.State.Time.hour = hour;
            Game.State.Time.minute = minute;
            GameTimeChangedEvent.Trigger(Game.State.Time.TotalMinutes);
            _quests?.Tick();
        }

        private QuestStatus Status => _quests.Find("test:quest").Status;

        [Test]
        public void ADeadlinePassingFailsTheQuestAndRunsItsFailActions()
        {
            Quest("deadline: { days: 1, at: '18:00' }");
            At(day: 2, hour: 17, minute: 50);
            Assert.That(Status, Is.EqualTo(QuestStatus.Active), "Still in time on the next day before 18:00.");
            At(day: 2, hour: 18, minute: 0);
            Assert.That(Status, Is.EqualTo(QuestStatus.Failed));
            Assert.That(_quests.Find("test:quest").StepId, Is.EqualTo("first"), "The journal shows where it failed.");
            Assert.That(Game.State.Story.Has("test:failed"), Is.True);
            Assert.That(() => _quests.CompleteStep("test:quest"), Throws.InvalidOperationException, "A failed quest is over.");
        }

        [Test]
        public void ADeadlineWithoutATimeLastsUntilTheEndOfThatDay()
        {
            Quest("deadline: { days: 0 }");
            At(day: 1, hour: 23, minute: 59);
            Assert.That(Status, Is.EqualTo(QuestStatus.Active));
            At(day: 2, hour: 0, minute: 0);
            Assert.That(Status, Is.EqualTo(QuestStatus.Failed));
        }

        [Test]
        public void AFailConditionFailsTheQuestOnceItHolds()
        {
            Quest("failWhen: \"GameState.Story.Has('test:festival_over')\"");
            Assert.That(Status, Is.EqualTo(QuestStatus.Active));
            Game.Lua.CreateEngine().Execute("GameState.Story.Set('test:festival_over', true)");
            _quests.Tick();
            Assert.That(Status, Is.EqualTo(QuestStatus.Failed));
        }
    }
}
