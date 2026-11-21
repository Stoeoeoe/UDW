using System;
using System.IO;
using Core.Common.Editor;
using Core.Context;
using Core.Location;
using NUnit.Framework;
using static Core.Common.Editor.Reflect;

namespace Core.Game.Editor
{
    /// <summary>Quick save and load use their own slot, never touch the session's current slot, and refuse unsafe moments.</summary>
    public sealed class QuickSaveTests : GameTest
    {
        private GameStateManager _session;
        private GameSaveService _saves;
        private string _quickSlot;

        [SetUp]
        public void SetUp()
        {
            _session = Game.Get<GameStateManager>();
            _saves = Game.Get<GameSaveService>();
            // The developer's real quick save must never be touched by tests.
            _quickSlot = "test-" + Guid.NewGuid().ToString("N");
            Set(_session, "_quickSaveSlot", _quickSlot);
            Game.Get<PlayerStateManager>().InitializeHome();
            Game.State.Time.initialized = true;
            Game.State.Time.daysSinceStart = 1;
            Game.State.Time.dayOfSeason = 1;
            Game.State.Time.hour = 6;
            var location = Game.Asset<LocationData>();
            location.SetId("test:farm");
            Game.Location = location;
        }

        [TearDown]
        public void DeleteSlots() => _saves.Delete(_quickSlot);

        private void BecomeReady()
        {
            Game.Ready = true;
            Game.CreatePlayer();
            Game.Get<PlayerInteractionContext>().LateTick();
        }

        [Test]
        public void SavingIsOnlyAllowedWhenTheLocationIsReady()
        {
            Assert.That(_session.CanSaveOrLoadNow, Is.False);
            BecomeReady();
            Assert.That(_session.CanSaveOrLoadNow, Is.True);
        }

        [Test]
        public void TheOvernightSequenceBlocksSaving()
        {
            BecomeReady();
            Game.Clock.BeginOvernight();
            Assert.That(_session.CanSaveOrLoadNow, Is.False);
            Assert.That(_session.QuickSave(), Is.False);
            Assert.That(File.Exists(GameSaveService.GetSavePath(_quickSlot)), Is.False);
        }

        [Test]
        public void QuickSaveWritesTheQuickSlotAndLeavesTheCurrentSlotAlone()
        {
            BecomeReady();
            var current = "test-" + Guid.NewGuid().ToString("N");
            try
            {
                _session.Save(current);
                Game.State.Time.hour = 9;
                Assert.That(_session.QuickSave(), Is.True);

                Assert.That(_session.CurrentSlot, Is.EqualTo(current));
                Assert.That(_saves.TryLoad(_quickSlot, out var quick), Is.True);
                Assert.That(quick.time.hour, Is.EqualTo(9));
                Assert.That(quick.session.LocationId, Is.EqualTo("test:farm"));
                Assert.That(_saves.TryLoad(current, out var saved), Is.True);
                Assert.That(saved.time.hour, Is.EqualTo(6), "The real slot is not overwritten by a quick save.");
            }
            finally { _saves.Delete(current); }
        }

        [Test]
        public void QuickLoadWithoutAQuickSaveDoesNothing()
        {
            BecomeReady();
            Assert.That(_session.QuickLoad(), Is.False);
        }

        [Test]
        public void QuickLoadIsRefusedWhenNotSafeEvenWithAQuickSave()
        {
            BecomeReady();
            Assert.That(_session.QuickSave(), Is.True);
            Game.Clock.BeginOvernight();
            Assert.That(_session.QuickLoad(), Is.False);
        }

        [Test]
        public void QuickLoadOfAnUnregisteredLocationFailsBeforeChangingAnything()
        {
            Game.Location.SetId("missing-mod:cave");
            BecomeReady();
            Assert.That(_session.QuickSave(), Is.True);
            Game.State.Time.hour = 11;

            Assert.That(() => _session.QuickLoad(), Throws.InvalidOperationException.With.Message.Contains("missing-mod:cave"));
            Assert.That(Game.State.Time.hour, Is.EqualTo(11), "The running game keeps its state.");
            Assert.That(Game.Ready, Is.True);
        }
    }
}
