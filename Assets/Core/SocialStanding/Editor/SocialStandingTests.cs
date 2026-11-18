using System;
using System.Collections.Generic;
using Character;
using Core.Common.Editor;
using Core.Events;
using Core.Game;
using Core.Tile.Editor.Vulcanus;
using NUnit.Framework;
using Sirenix.Serialization;

namespace Core.SocialStanding.Editor
{
    public sealed class SocialStandingTests : ServiceTest
    {
        private SocialStandingService _standing;
        private readonly List<SocialStandingChangedEvent> _changes = new();
        private Listener _listener;

        [SetUp]
        public void SetUp()
        {
            Game.Catalog<CharacterCatalog>(
                VulcanusJson.Populate(Game.Asset<CharacterDefinition>(), "{ id: 'test:baker', name: 'Baker', startingSocialStanding: 80 }"),
                VulcanusJson.Populate(Game.Asset<CharacterDefinition>(), "{ id: 'test:plain', name: 'Plain' }"));
            _standing = Game.Get<SocialStandingService>();
            _changes.Clear();
            _listener = new Listener(_changes.Add);
            EventBus<SocialStandingChangedEvent>.Subscribe(_listener);
        }

        [TearDown]
        public void TearDown() => EventBus<SocialStandingChangedEvent>.Unsubscribe(_listener);

        [Test]
        public void ACharacterStartsAtTheirDefinitionsValueAndEveryoneElseAtFifty()
        {
            Assert.That(_standing.Get("test:baker"), Is.EqualTo(80));
            Assert.That(_standing.Get("test:plain"), Is.EqualTo(50), "A character that says nothing starts at the default.");
            Assert.That(_standing.Get("test:village"), Is.EqualTo(50), "A village or anything else has no definition.");
        }

        [Test]
        public void ChangesAddUpAndStopAtTheCaps()
        {
            Assert.That(_standing.Increase("test:village", 20), Is.EqualTo(70));
            Assert.That(_standing.Decrease("test:village", 5), Is.EqualTo(65));
            Assert.That(_standing.Increase("test:village", 1000), Is.EqualTo(100));
            Assert.That(_standing.Decrease("test:village", 1000), Is.EqualTo(0));
            Assert.That(_standing.Decrease("test:village", int.MaxValue), Is.EqualTo(0));
            Assert.That(_standing.Increase("test:village", int.MaxValue), Is.EqualTo(100), "Large amounts don't overflow.");
        }

        [Test]
        public void ChangingStartsFromTheCharactersStartingValue()
        {
            Assert.That(_standing.Increase("test:baker", 15), Is.EqualTo(95));
            Assert.That(_standing.Decrease("test:baker", 95), Is.EqualTo(0));
        }

        [Test]
        public void EachRealChangeRaisesAnEventAndOnesThatChangeNothingDoNot()
        {
            _standing.Increase("test:village", 10);
            _standing.Increase("test:village", 0);
            _standing.Increase("test:village", 100);
            _standing.Increase("test:village", 1); // Already at the cap.
            Assert.That(_changes, Is.EqualTo(new[]
            {
                new SocialStandingChangedEvent { SubjectId = "test:village", PreviousStanding = 50, NewStanding = 60 },
                new SocialStandingChangedEvent { SubjectId = "test:village", PreviousStanding = 60, NewStanding = 100 }
            }));
        }

        [Test]
        public void ComparisonsReadTheCurrentStanding()
        {
            Assert.That(_standing.HasMoreThan("test:village", 49), Is.True);
            Assert.That(_standing.HasMoreThan("test:village", 50), Is.False);
            Assert.That(_standing.HasLessThan("test:village", 51), Is.True);
            Assert.That(_standing.HasLessThan("test:village", 50), Is.False);
        }

        [Test]
        public void MistakesFailClearly()
        {
            Assert.That(() => _standing.Get("village"), Throws.ArgumentException, "Subjects are namespaced IDs.");
            Assert.That(() => _standing.Get("Test:Village"), Throws.ArgumentException, "And lowercase.");
            Assert.That(() => _standing.Increase("test:village", -1), Throws.TypeOf<ArgumentOutOfRangeException>());
            Assert.That(() => _standing.Decrease("test:village", -1), Throws.TypeOf<ArgumentOutOfRangeException>());
            Assert.That(_changes, Is.Empty);
        }

        [Test]
        public void StandingsAreSavedLoadedAndValidated()
        {
            _standing.Increase("test:village", 30);
            var json = SerializationUtility.SerializeValue(Game.State.Data, DataFormat.JSON);
            var loaded = SerializationUtility.DeserializeValue<GameSaveData>(json, DataFormat.JSON);

            Game.State.Restore(loaded);
            Assert.That(_standing.Get("test:village"), Is.EqualTo(80), "The service reads the loaded save.");
            Assert.That(_standing.Get("test:baker"), Is.EqualTo(80), "A standing that never changed isn't saved, so it still starts from its definition.");
            Assert.That(() => loaded.socialStanding.Validate(), Throws.Nothing);

            var invalid = new SocialStandingState();
            invalid.Set("test:village", 101);
            Assert.That(() => invalid.Validate(), Throws.TypeOf<FormatException>());
            invalid.Set("test:village", -1);
            Assert.That(() => invalid.Validate(), Throws.TypeOf<FormatException>());
            invalid.Set("village", 5);
            Assert.That(() => invalid.Validate(), Throws.TypeOf<FormatException>());
        }

        [Test]
        public void LuaReadsComparesAndChangesStandings()
        {
            var lua = Game.Lua.CreateEngine();
            Assert.That(lua.EvaluateCondition("SocialStanding.Get('test:baker') == 80"), Is.True);
            Assert.That(lua.EvaluateCondition("SocialStanding.HasMoreThan('test:village', 49) and SocialStanding.HasLessThan('test:village', 51)"), Is.True);

            lua.Execute("SocialStanding.Increase('test:village', 25) SocialStanding.Decrease('test:baker', 100)");
            Assert.That(_standing.Get("test:village"), Is.EqualTo(75));
            Assert.That(_standing.Get("test:baker"), Is.EqualTo(0));
            Assert.That(_changes, Has.Count.EqualTo(2));

            Assert.That(() => lua.Execute("SocialStanding.Increase('test:village', 1.5)"), Throws.Exception, "Whole numbers only.");
            Assert.That(() => lua.Execute("SocialStanding.Decrease('test:village', -5)"), Throws.Exception, "Not negative.");
            Assert.That(() => lua.EvaluateCondition("SocialStanding.Get('test:village') > 0 and SocialStanding.Increase('test:village', 1) > 0"),
                Throws.Exception, "Conditions are read-only.");
        }

        [Test]
        public void ACharacterDefinitionRejectsAStartingStandingOutsideTheRange()
        {
            Assert.That(() => VulcanusJson.Populate(Game.Asset<CharacterDefinition>(), "{ id: 'test:high', name: 'High', startingSocialStanding: 101 }"),
                Throws.ArgumentException.With.Message.Contains("StartingSocialStanding"));
            Assert.That(() => VulcanusJson.Populate(Game.Asset<CharacterDefinition>(), "{ id: 'test:low', name: 'Low', startingSocialStanding: -1 }"),
                Throws.ArgumentException.With.Message.Contains("StartingSocialStanding"));
        }

        private sealed class Listener : IEventListener<SocialStandingChangedEvent>
        {
            private readonly Action<SocialStandingChangedEvent> _received;
            public Listener(Action<SocialStandingChangedEvent> received) => _received = received;
            public void OnEvent(SocialStandingChangedEvent e) => _received(e);
        }
    }
}
