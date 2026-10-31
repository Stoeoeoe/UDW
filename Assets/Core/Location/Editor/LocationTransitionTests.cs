using System;
using System.Collections;
using System.Reflection;
using Character;
using Core.Common.Editor;
using Core.Tile;
using Interaction;
using NUnit.Framework;
using UI.Shared;
using UnityEngine;

namespace Core.Location.Editor
{
    public sealed class ContactInteractionProbe : AbstractInteractable
    {
        public int Activations;
        public override bool RequiresButtonPress => false;
        protected override bool Interact(GameCharacter instigator) { Activations++; return true; }
        public void Contact(Collider2D collider) => OnTriggerEnter2D(collider);
    }

    [Category("LocationTransitions")]
    public sealed class LocationTransitionTests
    {
        private GameTestFixture _fixture;
        private LevelManager _level;
        private MainCharacter _player, _other;
        private LocationData _location;

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Location transitions");
            _level = _fixture.RegisterSingleton<LevelManager>();
            _fixture.RegisterSingleton<CharacterManager>();
            _fixture.RegisterSingleton<MapManager>();
            _fixture.RegisterSingleton<UrGUIManager>();
            _other = _fixture.CreateCharacter("Other actor");
            _player = _fixture.CreateCharacter("Player");
            _location = _fixture.Own(ScriptableObject.CreateInstance<LocationData>());
            _location.id = "test:location";
            typeof(LevelManager).GetProperty(nameof(LevelManager.CurrentLocationData)).SetValue(_level, _location);
            SetReady(true);
        }

        [TearDown] public void TearDown() => _fixture.Dispose();

        [Test]
        public void ContactRequiresPlayerAndReadyLocationButExplicitCommandsAllowOtherActors()
        {
            // Physics contact only happens on active actors; parent lookups exclude inactive hierarchies.
            _fixture.Root.SetActive(true);
            _player.transform.parent.gameObject.SetActive(true);
            _other.transform.parent.gameObject.SetActive(true);
            var root = new GameObject("Contact probe", typeof(BoxCollider2D));
            root.transform.SetParent(_fixture.Root.transform);
            var probe = root.AddComponent<ContactInteractionProbe>();
            probe.Contact(_other.GetComponent<Collider2D>());
            Assert.That(probe.Activations, Is.Zero);
            probe.TriggerInteraction(_other);
            Assert.That(probe.Activations, Is.EqualTo(1), "Explicit actor commands remain supported.");
            SetReady(false);
            probe.Contact(_player.GetComponent<Collider2D>());
            Assert.That(probe.Activations, Is.EqualTo(1));
            SetReady(true);
            Assert.That(MainCharacter.CurrentMainCharacter, Is.SameAs(_player));
            Assert.That(_player.GetComponent<Collider2D>().GetComponentInParent<GameCharacter>(), Is.SameAs(_player));
            Assert.That(probe.CanInteract, Is.True);
            probe.Contact(_player.GetComponent<Collider2D>());
            Assert.That(probe.Activations, Is.EqualTo(2));
        }

        [Test]
        public void LocationLinksRejectExplicitNonPlayerCommands()
        {
            var root = new GameObject("Link", typeof(BoxCollider2D));
            root.transform.SetParent(_fixture.Root.transform);
            var link = root.AddComponent<LocationLink>();
            // A missing target would otherwise throw: non-player commands must never reach routing.
            Assert.That(typeof(LocationLink).GetMethod("Interact", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(link, new object[] { _other }), Is.False);
        }

        [Test]
        public void CoveringLocationRejectsDuplicateLoadsAndLocalTeleports()
        {
            var routine = (IEnumerator)typeof(LevelManager).GetMethod("LoadRoutine", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(_level, new object[] { _location.ScenePath, _location, "entry", Vector2.down, false, null });
            try
            {
                Assert.That(routine.MoveNext(), Is.True); // Await the cover before touching scenes.
                Assert.That(_level.SceneReady, Is.False);
                Assert.That(_level.LoadLocation(_location, "entry", Vector2.down), Is.False);
                Assert.That(_level.TransitionWithinCurrentLocation("entry", Vector2.down), Is.False);
                Assert.Throws<InvalidOperationException>(() => _level.LoadLocationCovered(_location, _ => { }).MoveNext());
            }
            finally { ((IDisposable)routine).Dispose(); }
            Assert.That(_player.IsConditionOrControlBlocked, Is.False);
            SetReady(true);
            // A ready notification alone cannot release the transition's ownership during its final callbacks.
            typeof(LevelManager).GetField("_transitionInProgress", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(_level, true);
            Assert.That(_level.LoadLocation(_location, "entry", Vector2.down), Is.False);
        }

        [Test]
        public void ExplicitMissingEntryDoesNotUseDefaultSpawn()
        {
            var root = _fixture.Own(new GameObject("Default spawn"));
            root.AddComponent<SpawnPoint>();
            var originalPosition = _player.transform.position;
            var method = typeof(LevelManager).GetMethod("PlaceCharacterAtSpawn", BindingFlags.Instance | BindingFlags.NonPublic);
            var error = Assert.Throws<TargetInvocationException>(() => method.Invoke(_level,
                new object[] { _player, "misspelled-entry", Vector2.down }));
            Assert.That(error.InnerException, Is.TypeOf<InvalidOperationException>());
            StringAssert.Contains("misspelled-entry", error.InnerException.Message);
            Assert.That(_player.transform.position, Is.EqualTo(originalPosition));
        }

        [TestCase(null)]
        [TestCase("Default")]
        public void InitialFallbackAndExplicitMatchingSpawnStillPlacePlayer(string entryKey)
        {
            var root = _fixture.Own(new GameObject("Default spawn"));
            root.transform.position = new Vector3(123, 456, 0);
            root.AddComponent<SpawnPoint>();
            typeof(LevelManager).GetMethod("PlaceCharacterAtSpawn", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(_level, new object[] { _player, entryKey, Vector2.left });
            Assert.That(_player.transform.position, Is.EqualTo(root.transform.position));
            Assert.That(_player.Orientation.FacingDirection, Is.EqualTo(Vector2.left));
        }

        private void SetReady(bool value) => typeof(LevelManager).GetProperty(nameof(LevelManager.SceneReady)).SetValue(_level, value);
    }
}
