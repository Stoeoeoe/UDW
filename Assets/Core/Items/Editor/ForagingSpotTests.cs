using System;
using System.Linq;
using System.Reflection;
using Core.Common.Editor;
using Core.Game;
using Core.Location;
using Core.Spawning;
using NUnit.Framework;
using Sirenix.Serialization;
using UnityEditor;
using UnityEngine;
using Util;
using SerializationUtility = Sirenix.Serialization.SerializationUtility;

namespace Core.Items.Editor
{
    public sealed class ForagingSpotTests
    {
        private GameTestFixture _fixture;
        private WorldObjectSpawner _spawner;
        private LocationData _location;
        private ForagingSpot _spot;
        private ForagePickup _fig;

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Forage spot state");
            _fixture.AddSingleton<GameStateManager>();
            GameState.Time.initialized = true;
            GameState.Time.daysSinceStart = 1;
            GameState.Time.dayOfSeason = 1;
            GameState.Time.hour = 6;
            var level = _fixture.RegisterSingleton<LevelManager>();
            _location = _fixture.Own(ScriptableObject.CreateInstance<LocationData>());
            _location.id = "test:forage";
            typeof(LevelManager).GetProperty(nameof(LevelManager.CurrentLocationData)).SetValue(level, _location);
            var catalog = AssetDatabase.LoadAssetAtPath<SpawnableCatalog>("Assets/Content/SpawnableCatalog.asset");
            _spawner = _fixture.AddSingleton<WorldObjectSpawner>(spawner => typeof(WorldObjectSpawner)
                .GetField("catalog", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(spawner, catalog));
            _spawner.EnterLocation(_location, Array.Empty<AuthoredSpawnPlacement>());
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Content/Spawnables/ForagingSpot.prefab").GetComponent<ForagingSpot>();
            _spot = (ForagingSpot)_spawner.Spawn(prefab, new Vector3(5, 5, 0));
            _fig = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Content/Spawnables/ForageFig.prefab").GetComponent<ForagePickup>();
            var list = new WeightedList<ForagePickup>();
            list.Add(_fig, 1);
            Set("forage", list);
            Set("dailySpawnChance", 1f);
        }

        [TearDown] public void TearDown() => _fixture.Dispose();

        [Test]
        public void CollectionCannotRerollTodayButRefillsOnTheNextDay()
        {
            _spot.Refresh(1);
            var state = (ForagingSpotState)_spot.State;
            var first = state.forageId;
            Assert.That(_spawner.SpawnedObjects.Count, Is.EqualTo(2));
            _spawner.Despawn(first);
            _spot.Refresh(1);
            Assert.That(_spawner.SpawnedObjects.Count, Is.EqualTo(1));
            GameState.Time.daysSinceStart = 2;
            _spot.Refresh(2);
            Assert.That(state.forageId, Is.Not.EqualTo(first));
            Assert.That(_spawner.SpawnedObjects.Count, Is.EqualTo(2));
        }

        [Test]
        public void UncollectedForageSurvivesNewDaysAndLocationReentry()
        {
            _spot.Refresh(1);
            var state = (ForagingSpotState)_spot.State;
            var forageId = state.forageId;
            GameState.Time.daysSinceStart = 2;
            _spot.Refresh(2);
            Assert.That(state.forageId, Is.EqualTo(forageId));
            _spawner.OnLocationLeave(_location);
            _spawner.EnterLocation(_location, Array.Empty<AuthoredSpawnPlacement>());
            _spot = _spawner.SpawnedObjects.OfType<ForagingSpot>().Single();
            _spot.Refresh(2);
            Assert.That(((ForagingSpotState)_spot.State).forageId, Is.EqualTo(forageId));
            Assert.That(_spawner.SpawnedObjects.Count, Is.EqualTo(2));
        }

        [Test]
        public void FailedChanceIsSavedAndCannotBeRetriedOnTheSameDay()
        {
            Set("dailySpawnChance", 0f);
            _spot.Refresh(1);
            Set("dailySpawnChance", 1f);
            _spot.Refresh(1);
            Assert.That(_spawner.SpawnedObjects.Count, Is.EqualTo(1));
            GameState.Time.daysSinceStart = 5;
            _spot.Refresh(5); // Catch up only the current day, rather than accumulating missed rolls.
            Assert.That(_spawner.SpawnedObjects.Count, Is.EqualTo(2));
            Assert.That(((ForagingSpotState)_spot.State).lastProcessedDay, Is.EqualTo(5));
        }

        [TestCase(0f)]
        [TestCase(-1f)]
        [TestCase(float.NaN)]
        public void InvalidWeightsFailBeforeGameplay(float weight)
        {
            var list = new WeightedList<ForagePickup>();
            list.Add(_fig, weight);
            Set("forage", list);
            Assert.Throws<InvalidOperationException>(() => PickupConfigurationValidation.Check(_spot.gameObject));
        }

        [Test]
        public void EmptyAndMissingForageReferencesFailBeforeGameplay()
        {
            var list = new WeightedList<ForagePickup>();
            Set("forage", list);
            Assert.Throws<InvalidOperationException>(() => PickupConfigurationValidation.Check(_spot.gameObject));
            list.Add(null, 1f);
            Assert.Throws<InvalidOperationException>(() => PickupConfigurationValidation.Check(_spot.gameObject));
        }

        [Test]
        public void UnregisteredItemFailsBeforeGameplay()
        {
            var item = _fixture.Own(ScriptableObject.CreateInstance<ForageableItem>());
            var data = new SerializedObject(item);
            data.FindProperty("_itemId").stringValue = "test:unregistered-forage";
            data.ApplyModifiedPropertiesWithoutUndo();
            Assert.Throws<InvalidOperationException>(() => PickupConfigurationValidation.CheckItem(item));
        }

        [Test]
        public void SpotStateRoundTripsThroughTheLiveSaveRoot()
        {
            GameState.Time.daysSinceStart = 3;
            _spot.Refresh(3);
            var original = (ForagingSpotState)_spot.State;
            var save = new GameSaveData();
            save.player.Home = new PlayerHomeState("test:home", "test:bed");
            save.time.initialized = true;
            save.time.daysSinceStart = 3;
            save.time.dayOfSeason = 3;
            save.time.hour = 6;
            save.world.Set(_location.id, "spot", original);
            save.Validate();
            var bytes = SerializationUtility.SerializeValue(save, DataFormat.Binary);
            var restored = SerializationUtility.DeserializeValue<GameSaveData>(bytes, DataFormat.Binary);
            Assert.That(restored.world.TryGet(_location.id, "spot", out ForagingSpotState state), Is.True);
            Assert.That(state.lastProcessedDay, Is.EqualTo(3));
            Assert.That(state.forageId, Is.EqualTo(original.forageId));
            Assert.That(state.prefabId, Is.EqualTo(original.prefabId));
        }

        [Test]
        public void ExpirationEmptiesTheSpotBeforeItsDailyRoll()
        {
            _spot.Refresh(1);
            var spotState = (ForagingSpotState)_spot.State;
            var oldId = spotState.forageId;
            var pickup = _spawner.SpawnedObjects.Single(s => s.PersistentId == oldId);
            var deadline = ((ForagePickupState)pickup.State).expiresOnDay;
            GameState.Time.daysSinceStart = deadline;
            Set("dailySpawnChance", 0f);
            _spot.Refresh(deadline);
            Assert.That(spotState.forageId, Is.Null);
            Assert.That(GameState.World.TryGet(_location.id, oldId, out SpawnedObjectState _), Is.False);
            Assert.That(_spawner.SpawnedObjects.Count, Is.EqualTo(1));
            Set("dailySpawnChance", 1f);
            _spot.Refresh(deadline);
            Assert.That(_spawner.SpawnedObjects.Count, Is.EqualTo(1)); // An empty roll is still that day's only roll.
            GameState.Time.daysSinceStart++;
            _spot.Refresh(GameState.Time.daysSinceStart);
            Assert.That(_spawner.SpawnedObjects.Count, Is.EqualTo(2));
        }

        [Test]
        public void AnExpiredItemCanBeReplacedOnItsExpirationMorning()
        {
            _spot.Refresh(1);
            var spotState = (ForagingSpotState)_spot.State;
            var first = spotState.forageId;
            var old = _spawner.SpawnedObjects.Single(s => s.PersistentId == first);
            GameState.Time.daysSinceStart = ((ForagePickupState)old.State).expiresOnDay;
            _spot.Refresh(GameState.Time.daysSinceStart);
            Assert.That(spotState.forageId, Is.Not.EqualTo(first));
            Assert.That(_spawner.SpawnedObjects.Count, Is.EqualTo(2));
            var fresh = _spawner.SpawnedObjects.Single(s => s.PersistentId == spotState.forageId);
            Assert.That(((ForagePickupState)fresh.State).expiresOnDay, Is.GreaterThan(GameState.Time.daysSinceStart));
        }

        [Test]
        public void SavedExpirationSurvivesRestorationAndRemovesAnExpiredView()
        {
            var pickup = (ForagePickup)_spawner.Spawn(_fig, Vector3.zero);
            var id = pickup.PersistentId;
            var deadline = ((ForagePickupState)pickup.State).expiresOnDay;
            _spawner.OnLocationLeave(_location);
            GameState.Time.daysSinceStart = deadline;
            _spawner.EnterLocation(_location, Array.Empty<AuthoredSpawnPlacement>());
            pickup = (ForagePickup)_spawner.SpawnedObjects.Single(s => s.PersistentId == id);
            Assert.That(((ForagePickupState)pickup.State).expiresOnDay, Is.EqualTo(deadline));
            GameTestFixture.Invoke(pickup, "OnEnable");
            Assert.That(GameState.World.TryGet(_location.id, id, out SpawnedObjectState _), Is.False);
        }

        [Test]
        public void ForageExpirationRoundTripsAndRejectsInvalidSavedDeadlines()
        {
            var pickup = _spawner.Spawn(_fig, Vector3.zero);
            var original = (ForagePickupState)pickup.State;
            var bytes = SerializationUtility.SerializeValue<SpawnedObjectState>(original, DataFormat.Binary);
            var restored = SerializationUtility.DeserializeValue<SpawnedObjectState>(bytes, DataFormat.Binary);
            Assert.That(restored, Is.TypeOf<ForagePickupState>());
            Assert.That(((ForagePickupState)restored).expiresOnDay, Is.EqualTo(original.expiresOnDay));
            Assert.Throws<FormatException>(() => new ForagePickupState().Validate());
        }

        [Test]
        public void PerItemLifetimeMustBePositive()
        {
            var item = _fixture.Own(ScriptableObject.CreateInstance<ForageableItem>());
            var data = new SerializedObject(item);
            data.FindProperty("_itemId").stringValue = "test:forage";
            data.FindProperty("groundLifetimeDays").intValue = 0;
            data.ApplyModifiedPropertiesWithoutUndo();
            Assert.That(item.ValidateConfiguration().Any(e => e.Setting == "groundLifetimeDays"), Is.True);
        }

        [Test]
        public void InvalidSavedSpotFailsBeforeBinding()
        {
            var state = new ForagingSpotState { lastProcessedDay = 0 };
            Assert.Throws<FormatException>(state.Validate);
            state.lastProcessedDay = 1;
            state.forageId = " ";
            Assert.Throws<FormatException>(state.Validate);
        }

        [Test]
        public void ZeroWeightEntriesNeverWin()
        {
            var list = new WeightedList<string>();
            list.Add("excluded first", 0);
            list.Add("fig", 1);
            list.Add("excluded last", 0);
            var randomState = UnityEngine.Random.state;
            try
            {
                UnityEngine.Random.InitState(1234);
                for (var i = 0; i < 100; i++) Assert.That(list.GetRandomItem(), Is.EqualTo("fig"));
            }
            finally { UnityEngine.Random.state = randomState; }
        }

        private void Set(string field, object value) => typeof(ForagingSpot)
            .GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(_spot, value);
    }
}
