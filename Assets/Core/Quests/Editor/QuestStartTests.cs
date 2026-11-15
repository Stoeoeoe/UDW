using Core.Common.Editor;
using Core.Divinity;
using Core.Events;
using Core.Game;
using Core.Location;
using Core.Tile.Editor.Vulcanus;
using Core.TimeAndWeather;
using Core.TimeAndWeather.Seasons;
using NUnit.Framework;

namespace Core.Quests.Editor
{
    /// <summary>Quests that start by themselves at the moments their <c>start</c> names.</summary>
    public sealed class QuestStartTests : GameTest
    {
        private QuestService _quests;

        private void Quest(string start)
        {
            Game.Catalog<QuestCatalog>(VulcanusJson.Populate(Game.Asset<QuestDefinition>(),
                $"{{ id: 'test:quest', start: {start}, steps: [{{ id: 'first', objectives: [{{ id: 'x', kind: 'condition', condition: 'false' }}] }}] }}"));
            Game.CreatePlayer();
            _quests = Game.Get<QuestService>();
        }

        private LocationData Location(string mapId)
        {
            var location = Game.Asset<LocationData>();
            location.id = mapId;
            return location;
        }

        private bool Started()
        {
            _quests.Tick();
            return _quests.Find("test:quest") != null;
        }

        [Test]
        public void ANewDayStartsTheQuestOnceAndNothingElseDoes()
        {
            Quest("{ when: [{ on: 'newDay' }] }");
            Assert.That(Started(), Is.False, "Nothing has happened yet.");
            _quests.OnLocationEnter(Location("test:map"));
            Assert.That(Started(), Is.False, "Entering a map is not a new day.");
            NewDayEvent.Trigger(2);
            Assert.That(Started(), Is.True);
            _quests.Find("test:quest").Status = QuestStatus.Failed;
            NewDayEvent.Trigger(3);
            Assert.That(Started(), Is.True, "A quest that has run is never started again; this would throw if it were.");
        }

        [Test]
        public void ANewGameStartsItBeforeAnyLocationIsEntered()
        {
            Quest("{ when: [{ on: 'gameStart' }] }");
            Assert.That(Started(), Is.False);
            NewDayEvent.Trigger(2);
            Assert.That(Started(), Is.False, "A day is not the start of the game.");
            GameStartedEvent.Trigger();
            Assert.That(Started(), Is.True);
        }

        [Test]
        public void TheConditionMustHoldAtTheMoment()
        {
            Quest("{ when: [{ on: 'newDay' }], condition: \"GameState.Story.Has('test:ready')\" }");
            NewDayEvent.Trigger(2);
            Assert.That(Started(), Is.False);
            Game.State.Story.Set("test:ready", true);
            Assert.That(Started(), Is.False, "Nothing came, so the condition is not looked at.");
            NewDayEvent.Trigger(3);
            Assert.That(Started(), Is.True);
        }

        [Test]
        public void ASeasonStartsItOnlyWhenItIsTheNamedOne()
        {
            Quest("{ when: [{ on: 'newSeason', season: 'winter' }] }");
            Game.State.Time.season = Season.Autumn;
            SeasonStartEvent.Trigger(Game.Asset<SeasonData>());
            Assert.That(Started(), Is.False);
            Game.State.Time.season = Season.Winter;
            SeasonStartEvent.Trigger(Game.Asset<SeasonData>());
            Assert.That(Started(), Is.True);
        }

        [Test]
        public void FavourStartsItForTheDeityOnceItIsHighEnough()
        {
            Quest("{ when: [{ on: 'divineFavour', deity: 'test:ceres', atLeast: 10 }] }");
            EventBus<DivineFavourChangedEvent>.Raise(new DivineFavourChangedEvent { DeityId = "test:vesta", NewFavour = 50 });
            Assert.That(Started(), Is.False, "Another deity.");
            EventBus<DivineFavourChangedEvent>.Raise(new DivineFavourChangedEvent { DeityId = "test:ceres", NewFavour = 9 });
            Assert.That(Started(), Is.False, "Not enough yet.");
            EventBus<DivineFavourChangedEvent>.Raise(new DivineFavourChangedEvent { DeityId = "test:ceres", NewFavour = 10 });
            Assert.That(Started(), Is.True);
        }

        [Test]
        public void EnteringTheNamedMapStartsIt()
        {
            Quest("{ when: [{ on: 'locationChanged', map: 'test:harbour' }] }");
            _quests.OnLocationEnter(Location("test:map"));
            Assert.That(Started(), Is.False);
            _quests.OnLocationEnter(Location("test:harbour"));
            Assert.That(Started(), Is.True);
        }

        [Test]
        public void TheClockStepStartsItAndAnyOfSeveralMomentsWillDo()
        {
            Quest("{ when: [{ on: 'newDay' }, { on: 'everyTenMinutes' }] }");
            GameTimeChangedEvent.Trigger(Game.State.Time.TotalMinutes + 10);
            Assert.That(Started(), Is.True);
        }
    }
}
