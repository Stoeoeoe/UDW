using System.Linq;
using Core.Common.Editor;
using Core.Inventory;
using Core.Inventory.Editor;
using Core.Quests;
using Core.Tile.Editor.Vulcanus;
using NUnit.Framework;
using UnityEditor;
using UnityEngine.UIElements;

namespace UI.Journal.Editor
{
    public sealed class JournalPageTests : GameTest
    {
        private QuestService _quests;
        private InventoryTestItem _wine;
        private SlotInventory _bag;
        private VisualElement _root;
        private JournalPage _page;

        [SetUp]
        public void SetUp()
        {
            _wine = Game.Asset<InventoryTestItem>();
            ConfigurationTestData.Set(_wine, "Id", "test:wine");
            Game.Catalog<ItemCatalog>(_wine);
            Game.Catalog<QuestCatalog>(VulcanusJson.Populate(Game.Asset<QuestDefinition>(), @"{
                id: 'test:wine', title: 'Wine for the festival', description: 'The priestess needs wine.',
                steps: [
                    { id: 'buy', journal: 'Buy wine.', deadline: { days: 1, at: '18:00' },
                      objectives: [ { id: 'carry', kind: 'have', item: 'test:wine', count: 2, text: 'Wine' } ] },
                    { id: 'bring', journal: 'Bring it to the temple.',
                      objectives: [ { id: 'go', kind: 'reach', map: 'test:temple', text: 'The temple' } ] } ] }"));
            _bag = Game.CreatePlayer().MainInventory;
            _quests = Game.Get<QuestService>();
            Game.State.Time.daysSinceStart = 1;
            Game.State.Time.hour = 10;
            _root = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/UI/Journal/JournalPage.uxml").CloneTree();
            _page = new JournalPage(_root, _quests);
        }

        private string[] Shown()
        {
            _page.Show();
            return _root.Query<Label>().ToList().Select(label => label.text).ToArray();
        }

        [Test]
        public void WithoutQuestsTheJournalSaysSo() => Assert.That(Shown(), Does.Contain("No quests yet."));

        [Test]
        public void AnActiveQuestShowsItsStepObjectivesProgressAndDeadline()
        {
            _quests.Start("test:wine");
            _bag.AddItem(_wine, 1);
            var shown = Shown();
            Assert.That(shown, Does.Contain("Active"));
            Assert.That(shown, Does.Contain("Wine for the festival").And.Contain("The priestess needs wine."));
            Assert.That(shown, Does.Contain("Buy wine.").And.Contain("Wine: 1/2").And.Contain("Due day 2, 18:00"));
        }

        [Test]
        public void FinishedStepsStayWithTheirDayAndACompletedQuestMovesToItsSection()
        {
            _quests.Start("test:wine");
            _quests.CompleteStep("test:wine");
            Assert.That(Shown(), Does.Contain("Buy wine. · day 1, 10:00").And.Contain("Bring it to the temple."));
            _quests.CompleteStep("test:wine");
            var shown = Shown();
            Assert.That(shown, Does.Contain("Completed").And.Contain("Completed."));
            Assert.That(shown, Does.Not.Contain("Active"));
        }
    }
}
