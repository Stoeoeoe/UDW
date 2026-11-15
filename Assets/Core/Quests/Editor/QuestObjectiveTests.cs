using Core.Common.Editor;
using Core.Events;
using Core.Inventory;
using Core.Inventory.Editor;
using Core.Location;
using Core.Tile.Editor.Vulcanus;
using Core.Tile.Vulcanus;
using Core.TimeAndWeather;
using NUnit.Framework;

namespace Core.Quests.Editor
{
    /// <summary>The objectives the game meets by itself: have, reach and condition.</summary>
    public sealed class QuestObjectiveTests : GameTest
    {
        private QuestService _quests;
        private InventoryTestItem _wine;
        private SlotInventory _bag;

        [SetUp]
        public void SetUp()
        {
            _wine = Game.Asset<InventoryTestItem>();
            ConfigurationTestData.Set(_wine, "Id", "test:wine");
            Game.Catalog<ItemCatalog>(_wine);
        }

        /// <summary>
        /// Starts a quest whose first step has the objective. The second step never finishes by default, so the quest
        /// still being on it shows the first one finished.
        /// </summary>
        private void Quest(string objective, string next = "{ id: 'x', kind: 'condition', condition: 'false' }")
        {
            Game.Catalog<QuestCatalog>(VulcanusJson.Populate(Game.Asset<QuestDefinition>(),
                $"{{ id: 'test:quest', steps: [{{ id: 'first', objectives: [{objective}] }}, {{ id: 'second', objectives: [{next}] }}] }}"));
            _bag = Game.CreatePlayer().MainInventory;
            _quests = Game.Get<QuestService>();
            _quests.Start("test:quest");
        }

        private bool OnFirstStep()
        {
            _quests.Tick();
            return _quests.Find("test:quest").StepId == "first";
        }

        [Test]
        public void HaveIsMetOnceThePlayerCarriesEnough()
        {
            Quest("{ id: 'carry', kind: 'have', item: 'test:wine', count: 3 }");
            _bag.AddItem(_wine, 2);
            Assert.That(OnFirstStep(), Is.True, "Two of three.");
            _bag.AddItem(_wine, 1);
            Assert.That(OnFirstStep(), Is.False);
        }

        [Test]
        public void ReachingAMapIsMetOnEnteringIt()
        {
            Quest("{ id: 'go', kind: 'reach', map: 'test:map' }");
            _quests.OnLocationEnter(Location("test:other"));
            Assert.That(OnFirstStep(), Is.True);
            _quests.OnLocationEnter(Location("test:map"));
            Assert.That(OnFirstStep(), Is.False);
        }

        [Test]
        public void ReachingATriggerIsMetWhenThePlayerWalksIntoIt()
        {
            Quest("{ id: 'go', kind: 'reach', map: 'test:map', trigger: 'gate' }");
            _quests.OnLocationEnter(Location("test:map"));
            Assert.That(OnFirstStep(), Is.True, "Being on the map is not enough.");
            EventBus<MapTriggerEnteredEvent>.Raise(new MapTriggerEnteredEvent { TriggerId = "well" });
            Assert.That(OnFirstStep(), Is.True, "Another trigger.");
            EventBus<MapTriggerEnteredEvent>.Raise(new MapTriggerEnteredEvent { TriggerId = "gate" });
            Assert.That(OnFirstStep(), Is.False);
        }

        [Test]
        public void ConditionsAreCheckedAfterLuaWritesState()
        {
            Quest("{ id: 'ready', kind: 'condition', condition: \"GameState.Story.Has('test:ready')\" }");
            Assert.That(OnFirstStep(), Is.True);
            Game.Lua.CreateEngine().Execute("GameState.Story.Set('test:ready', true)");
            Assert.That(OnFirstStep(), Is.False);
        }

        [Test]
        public void ConditionsAreCheckedOnEachClockStep()
        {
            Quest("{ id: 'ready', kind: 'condition', condition: \"GameState.Story.Has('test:ready')\" }");
            Assert.That(OnFirstStep(), Is.True);
            Game.State.Story.Set("test:ready", true); // Not through Lua: nothing asks for a check yet.
            Assert.That(OnFirstStep(), Is.True);
            GameTimeChangedEvent.Trigger(Game.State.Time.TotalMinutes + 10);
            Assert.That(OnFirstStep(), Is.False);
        }

        [Test]
        public void ANewStepWhoseObjectivesAreAlreadyMetFinishesToo()
        {
            Quest("{ id: 'a', kind: 'condition', condition: 'true' }", next: "{ id: 'b', kind: 'condition', condition: 'true' }");
            _quests.Tick();
            _quests.Tick();
            Assert.That(_quests.Find("test:quest").Status, Is.EqualTo(QuestStatus.Completed));
        }

        [Test]
        public void TalkingToTheCharacterMeetsATalkObjectiveAndPlaysItsQuestDialogue()
        {
            Quest("{ id: 'ask', kind: 'talk', character: 'test:fabia', dialogue: 'test:ask_about_wine' }");
            Assert.That(_quests.FindConversation("test:other"), Is.Null);
            var conversation = _quests.FindConversation("test:fabia");
            Assert.That(conversation.DialogueId, Is.EqualTo("test:ask_about_wine"));
            _quests.CompleteConversation(conversation);
            Assert.That(OnFirstStep(), Is.False);
            Assert.That(_quests.FindConversation("test:fabia"), Is.Null, "Fabia is back to their usual dialogue.");
        }

        [Test]
        public void DeliveringTakesTheItemsAndNeedsThemAll()
        {
            Quest("{ id: 'bring', kind: 'deliver', character: 'test:fabia', item: 'test:wine', count: 2 }");
            _bag.AddItem(_wine, 1);
            Assert.That(_quests.FindConversation("test:fabia"), Is.Null, "Too few to deliver.");
            _bag.AddItem(_wine, 2);
            _quests.CompleteConversation(_quests.FindConversation("test:fabia"));
            Assert.That(_bag.Count(_wine), Is.EqualTo(1));
            Assert.That(OnFirstStep(), Is.False);
        }

        [Test]
        public void ACharacterIsMarkedWhileTheyHaveSomethingForTheQuest()
        {
            Quest("{ id: 'bring', kind: 'deliver', character: 'test:fabia', item: 'test:wine', count: 1 }");
            Assert.That(_quests.HasObjectiveFor("test:fabia"), Is.True, "Even before the player has the wine.");
            Assert.That(_quests.HasObjectiveFor("test:other"), Is.False);
            _bag.AddItem(_wine, 1);
            _quests.CompleteConversation(_quests.FindConversation("test:fabia"));
            Assert.That(_quests.HasObjectiveFor("test:fabia"), Is.False);
        }

        [Test]
        public void AConversationThatOutlivedItsStepChangesNothing()
        {
            Quest("{ id: 'bring', kind: 'deliver', character: 'test:fabia', item: 'test:wine', count: 1 }");
            _bag.AddItem(_wine, 1);
            var conversation = _quests.FindConversation("test:fabia");
            _quests.CompleteStep("test:quest");
            _quests.CompleteConversation(conversation);
            Assert.That(_bag.Count(_wine), Is.EqualTo(1), "Nothing taken.");
            Assert.That(_quests.Find("test:quest").StepId, Is.EqualTo("second"));
        }

        private LocationData Location(string mapId)
        {
            var location = Game.Asset<LocationData>();
            location.id = mapId;
            return location;
        }
    }
}
