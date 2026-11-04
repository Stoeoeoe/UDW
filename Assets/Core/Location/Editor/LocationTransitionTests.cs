using System;
using System.Collections;
using System.Reflection;
using Character;
using Core.Common.Editor;
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

        private void SetReady(bool value) => Game.Ready = value;
    }
}
