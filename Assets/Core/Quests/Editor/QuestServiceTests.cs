using System;
using System.Linq;
using Core.Common.Editor;
using Core.Game;
using Core.Tile.Editor.Vulcanus;
using NUnit.Framework;
using Sirenix.Serialization;

namespace Core.Quests.Editor
{
    public sealed class QuestServiceTests : ServiceTest
    {
        private QuestService _quests;

        [SetUp]
        public void SetUp()
        {
            var quest = VulcanusJson.Populate(Game.Asset<QuestDefinition>(), @"{
                id: 'test:quest',
                onStart: ""GameState.Story.Set('test:started', true)"",
                onComplete: ""GameState.Story.Set('test:completed', true)"",
                steps: [
                    { id: 'first', onComplete: ""GameState.Story.Set('test:first', true)"", objectives: [
                        { id: 'a', kind: 'condition', condition: 'true' },
                        { id: 'b', kind: 'condition', condition: 'true' } ] },
                    { id: 'second', objectives: [ { id: 'c', kind: 'condition', condition: 'true' } ] } ] }");
            Game.Catalog<QuestCatalog>(quest);
            _quests = Game.Get<QuestService>();
        }

        [Test]
        public void StartingPutsTheQuestOnItsFirstStepAndRunsItsStartActions()
        {
            _quests.Start("test:quest");
            var progress = _quests.Find("test:quest");
            Assert.That(progress.Status, Is.EqualTo(QuestStatus.Active));
            Assert.That(progress.StepId, Is.EqualTo("first"));
            Assert.That(Game.State.Story.Has("test:started"), Is.True);
            Assert.That(() => _quests.Start("test:quest"), Throws.InvalidOperationException, "A quest starts once.");
        }

        [Test]
        public void AStepFinishesOnceAllItsObjectivesAreDoneAndTheLastOneCompletesTheQuest()
        {
            _quests.Start("test:quest");
            _quests.CompleteObjective("test:quest", "a");
            Assert.That(_quests.Find("test:quest").StepId, Is.EqualTo("first"), "One objective is still open.");

            _quests.CompleteObjective("test:quest", "b");
            var progress = _quests.Find("test:quest");
            Assert.That(progress.StepId, Is.EqualTo("second"));
            Assert.That(progress.CompletedObjectives, Is.Empty, "The next step starts with none done.");
            Assert.That(Game.State.Story.Has("test:first"), Is.True, "The step's actions ran.");

            _quests.CompleteObjective("test:quest", "c");
            Assert.That(progress.Status, Is.EqualTo(QuestStatus.Completed));
            Assert.That(progress.StepId, Is.Null);
            Assert.That(progress.FinishedSteps.Select(step => step.StepId), Is.EqualTo(new[] { "first", "second" }));
            Assert.That(Game.State.Story.Has("test:completed"), Is.True);
        }

        [Test]
        public void CompletingAStepSkipsItsRemainingObjectives()
        {
            _quests.Start("test:quest");
            _quests.CompleteStep("test:quest");
            Assert.That(_quests.Find("test:quest").StepId, Is.EqualTo("second"));
        }

        [Test]
        public void MistakesFailClearly()
        {
            Assert.That(() => _quests.Start("test:missing"), Throws.InvalidOperationException);
            Assert.That(() => _quests.CompleteStep("test:quest"), Throws.InvalidOperationException, "Not started.");
            _quests.Start("test:quest");
            Assert.That(() => _quests.CompleteObjective("test:quest", "c"), Throws.InvalidOperationException, "Not on this step.");
            _quests.CompleteStep("test:quest");
            _quests.CompleteStep("test:quest");
            Assert.That(() => _quests.CompleteStep("test:quest"), Throws.InvalidOperationException, "Already completed.");
        }

        [Test]
        public void TheLuaModuleReadsAndAdvancesQuests()
        {
            var lua = Game.Lua.CreateEngine();
            Assert.That(lua.EvaluateCondition("not Quests.IsActive('test:quest')"), Is.True);
            lua.Execute("Quests.Start('test:quest')");
            Assert.That(lua.EvaluateCondition("Quests.IsActive('test:quest') and Quests.IsOnStep('test:quest', 'first')"), Is.True);
            lua.Execute("Quests.CompleteObjective('test:quest', 'a') Quests.CompleteStep('test:quest')");
            Assert.That(lua.EvaluateCondition("Quests.CurrentStep('test:quest') == 'second'"), Is.True);
            lua.Execute("Quests.CompleteStep('test:quest')");
            Assert.That(lua.EvaluateCondition("Quests.IsCompleted('test:quest') and Quests.CurrentStep('test:quest') == nil"), Is.True);
            Assert.That(() => lua.EvaluateCondition("Quests.IsActive('test:missing')"), Throws.Exception, "Quest IDs must exist.");
        }

        [Test]
        public void ProgressIsSavedAndLoaded()
        {
            _quests.Start("test:quest");
            _quests.CompleteObjective("test:quest", "a");
            var json = SerializationUtility.SerializeValue(Game.State.Data, DataFormat.JSON);
            var loaded = SerializationUtility.DeserializeValue<GameSaveData>(json, DataFormat.JSON);

            var progress = loaded.quests.Find("test:quest");
            Assert.That(progress.StepId, Is.EqualTo("first"));
            Assert.That(progress.CompletedObjectives, Is.EquivalentTo(new[] { "a" }));
            Assert.That(() => loaded.quests.Validate(), Throws.Nothing);
        }
    }
}
