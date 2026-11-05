using System;
using System.Collections;
using System.Reflection;
using Character;
using Core.Common.Editor;
using Core.Tile.Vulcanus;
using Interaction;
using NUnit.Framework;
using UnityEngine;
using static Core.Common.Editor.Reflect;

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
    public sealed class LocationTransitionTests : GameTest
    {

        private LevelManager _level;
        private MainCharacter _player, _other;
        private LocationData _location;

        [SetUp]
        public void SetUp()
        {

            _level = Game.Get<LevelManager>();

            _other = Game.CreateCharacter("Other actor");
            _player = Game.CreatePlayer();
            _location = Game.Asset<LocationData>();
            _location.id = "test:location";
            Game.Location = _location;
            SetReady(true);
        }

        [Test]
        public void ContactRequiresPlayerAndReadyLocationButExplicitCommandsAllowOtherActors()
        {
            // Physics contact only happens on active actors; parent lookups exclude inactive hierarchies.
            Game.Root.SetActive(true);
            _player.transform.parent.gameObject.SetActive(true);
            _other.transform.parent.gameObject.SetActive(true);
            var root = new GameObject("Contact probe", typeof(BoxCollider2D));
            root.transform.SetParent(Game.Root.transform);
            var probe = Game.Add<ContactInteractionProbe>(root);
            probe.Contact(_other.GetComponent<Collider2D>());
            Assert.That(probe.Activations, Is.Zero);
            probe.TriggerInteraction(_other);
            Assert.That(probe.Activations, Is.EqualTo(1), "Explicit actor commands remain supported.");
            SetReady(false);
            probe.Contact(_player.GetComponent<Collider2D>());
            Assert.That(probe.Activations, Is.EqualTo(1));
            SetReady(true);
            Assert.That(Game.Characters.MainCharacter, Is.SameAs(_player));
            Assert.That(_player.GetComponent<Collider2D>().GetComponentInParent<GameCharacter>(), Is.SameAs(_player));
            Assert.That(probe.CanInteract, Is.True);
            probe.Contact(_player.GetComponent<Collider2D>());
            Assert.That(probe.Activations, Is.EqualTo(2));
        }

        [Test]
        public void LocationLinksRejectExplicitNonPlayerCommands()
        {
            var root = new GameObject("Link", typeof(BoxCollider2D));
            root.transform.SetParent(Game.Root.transform);
            var link = Game.Add<LocationLink>(root);
            // A missing target would otherwise throw: non-player commands must never reach routing.
            Assert.That(Call(link, "Interact", _other), Is.False);
        }

        [Test]
        public void CoveringLocationRejectsDuplicateLoadsAndLocalTeleports()
        {
            var routine = (IEnumerator)Call(_level, "LoadRoutine", _location.ScenePath, _location, "entry", Vector2.down, false, null);
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
            Set(_level, "_transitionInProgress", true);
            Assert.That(_level.LoadLocation(_location, "entry", Vector2.down), Is.False);
        }

        [Test]
        public void ExplicitMissingEntryDoesNotUseDefaultSpawn()
        {
            var root = Game.Own(new GameObject("Default spawn"));
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
            var root = Game.Own(new GameObject("Default spawn"));
            root.transform.position = new Vector3(123, 456, 0);
            root.AddComponent<SpawnPoint>();
            Call(_level, "PlaceCharacterAtSpawn", _player, entryKey, Vector2.left);
            Assert.That(_player.transform.position, Is.EqualTo(root.transform.position));
            Assert.That(_player.Orientation.FacingDirection, Is.EqualTo(Vector2.left));
        }

        [TestCase(null)]
        [TestCase("")]
        public void BlankEntryPlacesThePlayerAtTheDebugSpawnPointInsteadOfTheLegacySpawn(string entryKey)
        {
            var legacy = Game.Own(new GameObject("Legacy spawn"));
            legacy.transform.position = new Vector3(1, 1, 0);
            legacy.AddComponent<SpawnPoint>();
            var anchor = CreateAnchor("test:start", new Vector3(50, 60, 0), Vector2.right, VulcanusMapAnchor.DebugSpawnPointTag);
            Call(_level, "PlaceCharacterAtSpawn", _player, entryKey, Vector2.left);
            Assert.That(_player.transform.position, Is.EqualTo(anchor.transform.position));
            Assert.That(_player.Orientation.FacingDirection, Is.EqualTo(Vector2.right), "The anchor's facing wins.");
        }

        [Test]
        public void ExplicitEntriesIgnoreTheDebugSpawnPoint()
        {
            CreateAnchor("test:start", new Vector3(50, 60, 0), Vector2.zero, VulcanusMapAnchor.DebugSpawnPointTag);
            var door = CreateAnchor("test:door", new Vector3(7, 8, 0), Vector2.zero);
            Call(_level, "PlaceCharacterAtSpawn", _player, "test:door", Vector2.down);
            Assert.That(_player.transform.position, Is.EqualTo(door.transform.position));
        }

        [Test]
        public void MapWithoutADebugSpawnPointKeepsUsingTheLegacySpawn()
        {
            CreateAnchor("test:door", new Vector3(7, 8, 0), Vector2.zero);
            var legacy = Game.Own(new GameObject("Legacy spawn"));
            legacy.transform.position = new Vector3(123, 456, 0);
            legacy.AddComponent<SpawnPoint>();
            Call(_level, "PlaceCharacterAtSpawn", _player, null, Vector2.down);
            Assert.That(_player.transform.position, Is.EqualTo(legacy.transform.position));
        }

        [Test]
        public void DuplicateDebugSpawnPointsFailClearly()
        {
            CreateAnchor("test:a", Vector3.zero, Vector2.zero, VulcanusMapAnchor.DebugSpawnPointTag);
            CreateAnchor("test:b", Vector3.one, Vector2.zero, VulcanusMapAnchor.DebugSpawnPointTag);
            var error = Assert.Throws<TargetInvocationException>(() =>
                typeof(LevelManager).GetMethod("PlaceCharacterAtSpawn", BindingFlags.Instance | BindingFlags.NonPublic)
                    .Invoke(_level, new object[] { _player, null, Vector2.down }));
            Assert.That(error.InnerException, Is.TypeOf<InvalidOperationException>());
            StringAssert.Contains(VulcanusMapAnchor.DebugSpawnPointTag, error.InnerException.Message);
        }

        private VulcanusMapAnchor CreateAnchor(string id, Vector3 position, Vector2 facing, params string[] tags)
        {
            var anchor = Game.Own(new GameObject(id)).AddComponent<VulcanusMapAnchor>();
            anchor.transform.position = position;
            anchor.Configure(id, id, facing, tags);
            return anchor;
        }

        private void SetReady(bool value) => Game.Ready = value;
    }
}
