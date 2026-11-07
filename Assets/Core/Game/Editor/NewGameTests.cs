using System;
using System.IO;
using System.Reflection;
using Core.Common.Editor;
using Core.Context;
using Core.Location;
using Core.TimeAndWeather;
using NUnit.Framework;
using static Core.Common.Editor.Reflect;

namespace Core.Game.Editor
{
    /// <summary>A new game replaces the state, takes a free slot, and is written once its first location is ready.</summary>
    public sealed class NewGameTests : GameTest
    {
        private GameStateManager _session;
        private GameSaveService _saves;

        [SetUp]
        public void SetUp()
        {
            _session = Game.Get<GameStateManager>();
            _saves = Game.Get<GameSaveService>();
            var location = Game.Asset<LocationData>();
            location.id = "test:farm";
            Game.Location = location;
        }

        private static bool StartAtHome(GameState state) =>
            (bool)typeof(GameState).GetProperty("StartAtHome", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public).GetValue(state);

        private void RaiseLocationReady() =>
            Get<Action<LocationData>>(Game.Get<LevelManager>(), "LocationReady")?.Invoke(Game.Location);

        [Test]
        public void ANewGameReplacesTheStateAndTakesAFreeSlot()
        {
            Game.State.Story.Set("test:marker", true);
            _session.NewGame("Hillside farm");

            Assert.That(Game.State.Story.Has("test:marker"), Is.False);
            Assert.That(Game.State.Data.saveName, Is.EqualTo("Hillside farm"));
            Assert.That(StartAtHome(Game.State), Is.True);
            Assert.That(_session.CurrentSlot, Is.Not.Null);
            Assert.That(File.Exists(GameSaveService.GetSavePath(_session.CurrentSlot)), Is.False, "Nothing is written before the location is ready.");
        }

        [Test]
        public void ANewGameStartsWithTheConfiguredMoney()
        {
            Game.State.Player.Wallet.SetBalance(5);
            _session.NewGame("Hillside farm");

            var startingMoney = Game.Get<PlayerSettings>().startingMoney;
            Assert.That(startingMoney, Is.GreaterThan(0), "The authored settings give new games some money to spend.");
            Assert.That(Game.State.Player.Wallet.Balance, Is.EqualTo(startingMoney));
        }

        [Test]
        public void ALoadedSaveClearsAPendingHomeStart()
        {
            _session.NewGame("Hillside farm");
            var slot = "test-" + Guid.NewGuid().ToString("N");
            try
            {
                Game.Get<PlayerStateManager>().InitializeHome();
                Game.State.Time.initialized = true;
                Game.State.Time.daysSinceStart = 1;
                Game.State.Time.dayOfSeason = 1;
                _saves.Save(slot, Game.State.Data);
                Assert.That(_session.Load(slot), Is.True);
                Assert.That(StartAtHome(Game.State), Is.False);
            }
            finally { _saves.Delete(slot); }
        }

        [Test]
        public void ANewGameCannotStartInsideALocation()
        {
            Game.Ready = true;
            Assert.Throws<InvalidOperationException>(() => _session.NewGame("Too late"));
        }

        [Test]
        public void ANewGameGetsTheStartingDateEvenWhenTheClockAlreadyStarted()
        {
            Game.Clock.Start();
            Game.State.Time.hour = 15;
            Game.State.Time.daysSinceStart = 9;

            _session.NewGame("Fresh");

            var settings = Game.Get<ClockSettings>();
            Assert.That(Game.State.Time.initialized, Is.True);
            Assert.That(Game.State.Time.daysSinceStart, Is.EqualTo(1));
            Assert.That(Game.State.Time.hour, Is.EqualTo(settings.startOfDay));
            Assert.That(Game.State.Time.dayOfSeason, Is.EqualTo(settings.startingDay));
        }

        [Test]
        public void TheNewSlotIsWrittenOnceWhenTheFirstLocationIsReady()
        {
            _session.NewGame("Hillside farm");
            var slot = _session.CurrentSlot;
            try
            {
                Game.Get<PlayerStateManager>().InitializeHome();
                Game.Clock.Start();
                Game.Ready = true;
                Game.CreatePlayer();
                Game.Get<PlayerInteractionContext>().LateTick();

                RaiseLocationReady();
                Assert.That(_saves.TryLoad(slot, out var saved), Is.True);
                Assert.That(saved.saveName, Is.EqualTo("Hillside farm"));
                Assert.That(saved.session.LocationId, Is.EqualTo("test:farm"));

                File.Delete(GameSaveService.GetSavePath(slot));
                RaiseLocationReady();
                Assert.That(File.Exists(GameSaveService.GetSavePath(slot)), Is.False, "Only the first location entry writes the slot.");
            }
            finally { _saves.Delete(slot); }
        }
    }
}
