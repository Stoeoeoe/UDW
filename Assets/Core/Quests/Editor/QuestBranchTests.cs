using System.Linq;
using Core.Common.Editor;
using Core.Tile.Editor.Vulcanus;
using NUnit.Framework;

namespace Core.Quests.Editor
{
    /// <summary>Steps that continue somewhere other than the following step.</summary>
    public sealed class QuestBranchTests : ServiceTest
    {
        private QuestService _quests;

        private QuestDefinition Quest(string steps) =>
            VulcanusJson.Populate(Game.Asset<QuestDefinition>(), $"{{ id: 'test:quest', steps: [{steps}] }}");

        private void Start(string steps)
        {
            Game.Catalog<QuestCatalog>(Quest(steps));
            _quests = Game.Get<QuestService>();
            _quests.Start("test:quest");
        }

        private const string Choice = @"
            { id: 'choose', objectives: [
                { id: 'aid', kind: 'condition', condition: 'true', next: 'helped' },
                { id: 'refuse', kind: 'condition', condition: 'true', next: 'refused' } ] },
            { id: 'helped', next: 'end', objectives: [ { id: 'x', kind: 'condition', condition: 'true' } ] },
            { id: 'refused', objectives: [ { id: 'y', kind: 'condition', condition: 'true' } ] }";

        private string[] Path() => _quests.Find("test:quest").FinishedSteps.Select(step => step.StepId).ToArray();

        [Test]
        public void AnObjectiveWithANextCompletesTheStepAtOnceAndContinuesThere()
        {
            Start(Choice);
            _quests.CompleteObjective("test:quest", "aid");
            Assert.That(_quests.Find("test:quest").StepId, Is.EqualTo("helped"));
            _quests.CompleteObjective("test:quest", "x");
            var progress = _quests.Find("test:quest");
            Assert.That(progress.Status, Is.EqualTo(QuestStatus.Completed), "The step's next is the end, not the step below it.");
            Assert.That(Path(), Is.EqualTo(new[] { "choose", "helped" }), "The journal shows the path taken.");
        }

        [Test]
        public void TheOtherBranchTakesItsOwnPath()
        {
            Start(Choice);
            _quests.CompleteObjective("test:quest", "refuse");
            _quests.CompleteObjective("test:quest", "y");
            Assert.That(_quests.Find("test:quest").Status, Is.EqualTo(QuestStatus.Completed));
            Assert.That(Path(), Is.EqualTo(new[] { "choose", "refused" }));
        }

        [Test]
        public void ObjectivesWithoutANextStillAllHaveToBeDone()
        {
            Start(@"
                { id: 'first', objectives: [
                    { id: 'a', kind: 'condition', condition: 'true' },
                    { id: 'b', kind: 'condition', condition: 'true' },
                    { id: 'skip', kind: 'condition', condition: 'true', next: 'end' } ] },
                { id: 'second', objectives: [ { id: 'c', kind: 'condition', condition: 'true' } ] }");
            _quests.CompleteObjective("test:quest", "a");
            Assert.That(_quests.Find("test:quest").StepId, Is.EqualTo("first"));
            _quests.CompleteObjective("test:quest", "b");
            Assert.That(_quests.Find("test:quest").StepId, Is.EqualTo("second"));
        }

        [Test]
        public void AStepsNextAppliesWhenItCompletesWithoutABranch()
        {
            Start(@"
                { id: 'first', next: 'third', objectives: [ { id: 'a', kind: 'condition', condition: 'true' } ] },
                { id: 'second', objectives: [ { id: 'b', kind: 'condition', condition: 'true' } ] },
                { id: 'third', objectives: [ { id: 'c', kind: 'condition', condition: 'true' } ] }");
            _quests.CompleteStep("test:quest");
            Assert.That(_quests.Find("test:quest").StepId, Is.EqualTo("third"));
        }

        [Test]
        public void LuaCanGoToAStepOrTheEnd()
        {
            Start(Choice);
            var lua = Game.Lua.CreateEngine();
            lua.Execute("Quests.GoToStep('test:quest', 'refused')");
            Assert.That(lua.EvaluateCondition("Quests.IsOnStep('test:quest', 'refused')"), Is.True);
            lua.Execute("Quests.GoToStep('test:quest', 'end')");
            Assert.That(_quests.Find("test:quest").Status, Is.EqualTo(QuestStatus.Completed));
            Assert.That(Path(), Is.EqualTo(new[] { "choose", "refused" }));
        }

        [Test]
        public void TheFirstConditionThatHoldsWhenTheStepCompletesDecidesTheNextStep()
        {
            Start(@"
                { id: 'first', next: 'third', objectives: [ { id: 'a', kind: 'condition', condition: 'true' } ],
                  nextIf: [ { condition: ""GameState.Story.Has('test:no')"", next: 'second' },
                            { condition: ""GameState.Story.Has('test:yes')"", next: 'end' } ] },
                { id: 'second', objectives: [ { id: 'b', kind: 'condition', condition: 'false' } ] },
                { id: 'third', objectives: [ { id: 'c', kind: 'condition', condition: 'false' } ] }");
            Game.State.Story.Set("test:yes", true);
            _quests.CompleteObjective("test:quest", "a");
            Assert.That(_quests.Find("test:quest").Status, Is.EqualTo(QuestStatus.Completed));
        }

        [Test]
        public void WithoutAHoldingConditionTheStepsNextApplies()
        {
            Start(@"
                { id: 'first', next: 'third', objectives: [ { id: 'a', kind: 'condition', condition: 'true' } ],
                  nextIf: [ { condition: 'false', next: 'second' } ] },
                { id: 'second', objectives: [ { id: 'b', kind: 'condition', condition: 'false' } ] },
                { id: 'third', objectives: [ { id: 'c', kind: 'condition', condition: 'false' } ] }");
            _quests.CompleteObjective("test:quest", "a");
            Assert.That(_quests.Find("test:quest").StepId, Is.EqualTo("third"));
        }

        [Test]
        public void GoingToAnUnknownStepFailsClearly()
        {
            Start(Choice);
            Assert.That(() => _quests.GoToStep("test:quest", "nowhere"), Throws.InvalidOperationException);
            Assert.That(_quests.Find("test:quest").StepId, Is.EqualTo("choose"), "Nothing changed.");
        }

        [Test]
        public void ImportRejectsUnknownTargetsAReservedStepIdAndLoops()
        {
            Assert.That(() => Quest("{ id: 'a', next: 'nowhere', objectives: [ { id: 'x', kind: 'condition', condition: 'true' } ] }"),
                Throws.ArgumentException.With.Message.Contains("unknown step 'nowhere'"));
            Assert.That(() => Quest("{ id: 'a', objectives: [ { id: 'x', kind: 'condition', condition: 'true', next: 'nowhere' } ] }"),
                Throws.ArgumentException.With.Message.Contains("unknown step 'nowhere'"));
            Assert.That(() => Quest("{ id: 'end', objectives: [ { id: 'x', kind: 'condition', condition: 'true' } ] }"),
                Throws.ArgumentException.With.Message.Contains("'end'"));
            Assert.That(() => Quest(@"
                { id: 'a', objectives: [ { id: 'x', kind: 'condition', condition: 'true' } ] },
                { id: 'b', next: 'a', objectives: [ { id: 'y', kind: 'condition', condition: 'true' } ] }"),
                Throws.ArgumentException.With.Message.Contains("loop"));
            Assert.That(() => Quest("{ id: 'a', nextIf: [ { condition: 'true', next: 'nowhere' } ], objectives: [ { id: 'x', kind: 'condition', condition: 'true' } ] }"),
                Throws.ArgumentException.With.Message.Contains("unknown step 'nowhere'"));
        }
    }
}
