using System.Collections.Generic;
using Core.Common.Editor;
using Core.TimeAndWeather;
using NUnit.Framework;
using VContainer.Unity;

namespace Core.Context.Editor
{
    /// <summary>
    /// The interaction context is a plain service driven by VContainer's late tick. It reads the registered player
    /// rather than searching the scene, so these tests need no scene objects or Unity callbacks.
    /// </summary>
    public sealed class PlayerInteractionContextTests : GameTest
    {
        private PlayerInteractionContext _context;
        private readonly List<PlayerInteractionContextSnapshot> _changes = new();

        [SetUp]
        public void SetUp()
        {
            _changes.Clear(); // NUnit reuses one fixture instance for every test.
            _context = Game.Get<PlayerInteractionContext>();
            _context.OnContextChanged += _changes.Add;
        }

        [Test]
        public void TheContainerDrivesBothFrameServicesThroughTheirTickInterfaces()
        {
            Assert.That(Game.Get<IReadOnlyList<ILateTickable>>(), Has.Member(_context));
            Assert.That(Game.Get<IReadOnlyList<ITickable>>(), Has.Member(Game.Clock));
            Assert.That(Game.Get<IReadOnlyList<IStartable>>(), Has.Member(Game.Clock));
        }

        [Test]
        public void WithoutARegisteredPlayerTheSnapshotIsEmpty()
        {
            Game.Ready = true;
            Game.CreateCharacter(); // An actor that was never registered as the player is not the player.

            _context.LateTick();

            Assert.That(_context.CurrentSnapshot, Is.EqualTo(PlayerInteractionContextSnapshot.Empty()));
            Assert.That(_changes, Is.Empty);
        }

        [Test]
        public void RegisteringThePlayerPublishesItsSnapshotOnTheNextLateTick()
        {
            Game.Ready = true;
            var player = Game.CreatePlayer();
            Assert.That(_context.CurrentSnapshot.Character, Is.Null, "Snapshots change at the tick, not when registered.");

            _context.LateTick();

            Assert.That(_context.CurrentSnapshot.Character, Is.SameAs(player));
            Assert.That(_context.CurrentSnapshot.SceneReady, Is.True);
            Assert.That(_changes, Has.Count.EqualTo(1));
        }

        [Test]
        public void AnUnchangedSnapshotIsNotRepublished()
        {
            Game.CreatePlayer();
            _context.LateTick();
            _context.LateTick();
            _context.Refresh();

            Assert.That(_changes, Has.Count.EqualTo(1));
        }

        [Test]
        public void ModeChangesAreReportedOnlyWhenTheModeActuallyChanges()
        {
            var modes = new List<InteractionMode>();
            _context.OnModeChanged += modes.Add;
            var player = Game.CreatePlayer();
            _context.LateTick();
            var initial = _context.CurrentSnapshot.Mode;

            Game.Ready = true;
            _context.LateTick();

            Assert.That(_context.CurrentSnapshot.Mode, Is.EqualTo(_changes[^1].Mode));
            Assert.That(modes.Count, Is.EqualTo(_context.CurrentSnapshot.Mode == initial ? 0 : 1));
            Assert.That(_changes, Has.Count.EqualTo(2));
            Assert.That(_context.CurrentSnapshot.Character, Is.SameAs(player));
        }

        [Test]
        public void ClockProgressReachesTheSnapshotThroughTheInjectedClock()
        {
            var clock = Game.Clock;
            clock.Start();
            Game.CreatePlayer();
            _context.LateTick();
            Assert.That(_context.CurrentSnapshot.CurrentTime, Is.EqualTo(clock.CurrentTime));

            clock.Advance(Game.Get<ClockSettings>().secondsPerInGameMinute);
            _context.LateTick();

            Assert.That(_context.CurrentSnapshot.CurrentTime.Minute, Is.EqualTo(10));
            Assert.That(_changes, Has.Count.EqualTo(2));
        }

        [Test]
        public void ReplacingThePlayerSwitchesTheSnapshotAndClearingItEmptiesIt()
        {
            var first = Game.CreatePlayer("First player");
            _context.LateTick();
            var second = Game.CreatePlayer("Second player");
            _context.LateTick();
            Assert.That(_context.CurrentSnapshot.Character, Is.SameAs(second));

            Game.Characters.UnregisterMainCharacter(first);
            _context.LateTick();
            Assert.That(_context.CurrentSnapshot.Character, Is.SameAs(second), "A replaced player cannot clear its successor.");

            Game.Characters.UnregisterMainCharacter(second);
            _context.LateTick();
            Assert.That(_context.CurrentSnapshot.Character, Is.Null);
        }
    }
}
