using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Core.Events;
using Core.Game;
using Core.TimeAndWeather;
using Core.Tile;
using NUnit.Framework;
using Sirenix.Serialization;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Plants.Editor
{
    [Category("FarmingTerrain")]
    public sealed class PlantManagerTests : IEventListener<PlantGrowthEvent>, IEventListener<SowPlantEvent>,
        IEventListener<PlantConditionChangedEvent>, IEventListener<FarmlandDriedEvent>
    {
        private GameObject _root;
        private GameStateManager _stateManager;
        private PlantManager _plants;
        private PlantCatalog _catalog;
        private PlantData _data;
        private Action<PlantGrowthEvent> _onGrowth;
        private readonly List<PlantGrowthEvent> _growth = new();
        private readonly List<SowPlantEvent> _sown = new();
        private readonly List<PlantConditionChangedEvent> _conditionChanges = new();
        private readonly List<FarmlandDriedEvent> _dried = new();

        [SetUp]
        public void SetUp()
        {
            Assert.That(GameStateManager.Instance, Is.Null, "Run outside a game session.");
            _growth.Clear();
            _sown.Clear();
            _conditionChanges.Clear();
            _dried.Clear();
            _onGrowth = null;
            _root = new GameObject("Plant manager tests");
            _root.SetActive(false);
            _stateManager = _root.AddComponent<GameStateManager>();
            typeof(Core.Singleton<GameStateManager>).GetMethod("Awake", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(_stateManager, null);
            // Keep the manager inactive: use an isolated catalog without changing Resources or singletons.
            _plants = _root.AddComponent<PlantManager>();
            _data = ScriptableObject.CreateInstance<PlantData>();
            _data.plantId = "test:crop";
            typeof(PlantData).GetField("growthStages", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_data, PlantDataTests.Stages(0, 2, 5));
            _catalog = ScriptableObject.CreateInstance<PlantCatalog>();
            _catalog.Synchronize(new Object[] { _data });
            typeof(PlantManager).GetField("_catalog", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_plants, _catalog);
            EventBus<PlantGrowthEvent>.Subscribe(this);
            EventBus<SowPlantEvent>.Subscribe(this);
            EventBus<PlantConditionChangedEvent>.Subscribe(this);
            EventBus<FarmlandDriedEvent>.Subscribe(this);
        }

        [TearDown]
        public void TearDown()
        {
            EventBus<PlantGrowthEvent>.Unsubscribe(this);
            EventBus<SowPlantEvent>.Unsubscribe(this);
            EventBus<PlantConditionChangedEvent>.Unsubscribe(this);
            EventBus<FarmlandDriedEvent>.Unsubscribe(this);
            if (_stateManager) typeof(GameStateManager).GetMethod("OnDestroy", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(_stateManager, null);
            Object.DestroyImmediate(_root);
            Object.DestroyImmediate(_catalog);
            Object.DestroyImmediate(_data);
        }

        [Test]
        public void SowingIsLocationScopedAndDoesNotReplaceOrAnnounceAnExistingPlant()
        {
            var position = new Vector2Int(-7, 4);
            Sow("farm", position, _data.plantId);
            var first = _plants.GetPlantState("farm", position);
            first.daysPassedSincePlanting = 3;
            Sow("farm", position, "other:crop");
            Sow("village", position, _data.plantId);
            Assert.That(_plants.GetPlantState("farm", position), Is.SameAs(first));
            Assert.That(first.plantID, Is.EqualTo(_data.plantId));
            Assert.That(first.daysPassedSincePlanting, Is.EqualTo(3));
            Assert.That(_plants.GetPlantState("village", position), Is.Not.SameAs(first));
            Assert.That(_plants.GetPlantState("village", position).daysPassedSincePlanting, Is.Zero);
            Assert.That(_plants.HasPlantAt("farm", position), Is.True);
            Assert.That(_plants.HasPlantAt("missing", position), Is.False);
            Assert.That(_plants.GetPlantState("missing", position), Is.Null);
            Assert.That(_plants.GetPlantStatesInLocation("farm").Single().Key, Is.EqualTo(position));
            Assert.That(_sown.Count, Is.EqualTo(2));
            Assert.That(_sown[0].LocationId, Is.EqualTo("farm"));
            Assert.That(_sown[0].Position, Is.EqualTo(position));
            Assert.That(_sown[0].PlantId, Is.EqualTo(_data.plantId));
        }

        [Test]
        public void NewDayGrowsPlantsInUnloadedLocationsAndOnlyAnnouncesStageChanges()
        {
            var seed = Store("farm", "plant:1,2", 0);
            var growing = Store("village", "plant:-3,4", 1);
            var mature = Store("farm", "plant:9,9", 8);
            _onGrowth = e =>
            {
                Assert.That(_plants.GetPlantState(e.LocationId, e.Position).daysPassedSincePlanting,
                    Is.EqualTo(2), "State must be committed before the callback.");
                Assert.That(GameState.World.GetStates<FarmlandState>().All(entry => !entry.State.irrigated), Is.True);
            };
            _plants.OnEvent(new NewDayEvent { Day = 10 });
            Assert.That(seed.daysPassedSincePlanting, Is.EqualTo(1));
            Assert.That(growing.daysPassedSincePlanting, Is.EqualTo(2));
            Assert.That(mature.daysPassedSincePlanting, Is.EqualTo(9));
            Assert.That(_growth.Count, Is.EqualTo(1));
            Assert.That(_growth[0].LocationId, Is.EqualTo("village"));
            Assert.That(_growth[0].Position, Is.EqualTo(new Vector2Int(-3, 4)));
            Assert.That(_growth[0].NewStageIndex, Is.EqualTo(1));
        }

        [Test]
        public void MissingAndDisabledDefinitionsKeepTheirSavedAgeAndOccupancy()
        {
            var unknown = new PlantState("missing:crop") { daysPassedSincePlanting = 4 };
            GameState.World.Set("farm", "plant:1,1", unknown);
            var disabled = Store("farm", "plant:2,2", 1);
            _catalog.SetEnabled(_data, false);
            _plants.OnEvent(new NewDayEvent());
            Assert.That(unknown.daysPassedSincePlanting, Is.EqualTo(4));
            Assert.That(disabled.daysPassedSincePlanting, Is.EqualTo(1));
            Assert.That(_plants.HasPlantAt("farm", Vector2Int.one), Is.True);
            Assert.That(_growth, Is.Empty);
            Assert.That(_plants.TryGetPlantData(_data.plantId, out _), Is.False);
            _catalog.SetEnabled(_data, true);
            GameState.World.Set("farm", "farmland:2,2", new FarmlandState { plowed = true, irrigated = true });
            _plants.OnEvent(new NewDayEvent());
            Assert.That(disabled.daysPassedSincePlanting, Is.EqualTo(2));
            Assert.That(_growth.Count, Is.EqualTo(1));
        }

        [Test]
        public void GrowthCallbacksCanRemoveAndSowPlantsWithoutInvalidatingTheDailyIteration()
        {
            Store("farm", "plant:1,1", 1);
            Store("farm", "plant:2,2", 1);
            Store("village", "plant:3,3", 1);
            _onGrowth = e =>
            {
                GameState.World.Remove(e.LocationId, $"plant:{e.Position.x},{e.Position.y}");
                Sow("new-location", Vector2Int.zero, _data.plantId);
            };
            Assert.DoesNotThrow(() => _plants.OnEvent(new NewDayEvent()));
            Assert.That(_growth.Count, Is.EqualTo(3));
            Assert.That(GameState.World.GetStates<PlantState>().Count(), Is.EqualTo(1));
            Assert.That(_plants.GetPlantState("new-location", Vector2Int.zero).daysPassedSincePlanting, Is.Zero,
                "Crops added during a callback must wait until the following day.");
        }

        [Test]
        public void SaveRoundTripRestoresPlantAgeAndFarmlandWithoutAssetReferences()
        {
            var root = new GameSaveData();
            root.world.Set("farm", "plant:-1,2", new PlantState(_data.plantId) { daysPassedSincePlanting = 4 });
            root.world.Set("farm", "farmland:-1,2", new FarmlandState { plowed = true, irrigated = true });
            root.world.Set("village", "plant:-1,2", new PlantState("missing:crop"));
            root.world.Set("farm", "plant:3,4", new PlantState(_data.plantId)
            {
                daysPassedSincePlanting = 2, consecutiveDaysWithoutWater = 5, condition = PlantCondition.Wilted
            });
            root.world.Set("farm", "plant:5,6", new PlantState(_data.plantId) { consecutiveDaysWithoutWater = 3 });
            var bytes = SerializationUtility.SerializeValue(root, DataFormat.JSON, out var references);
            Assert.That(references, Is.Empty);
            var loaded = SerializationUtility.DeserializeValue<GameSaveData>(bytes, DataFormat.JSON);
            typeof(GameStateManager).GetField("_data", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_stateManager, loaded);
            var position = new Vector2Int(-1, 2);
            Assert.That(_plants.GetPlantState("farm", position).daysPassedSincePlanting, Is.EqualTo(4));
            Assert.That(_plants.GetPlantState("village", position).plantID, Is.EqualTo("missing:crop"));
            Assert.That(GameState.World.TryGet("farm", "farmland:-1,2", out FarmlandState land), Is.True);
            Assert.That(land.plowed && land.irrigated, Is.True);
            var wilted = _plants.GetPlantState("farm", new Vector2Int(3, 4));
            Assert.That(wilted.condition, Is.EqualTo(PlantCondition.Wilted));
            Assert.That(wilted.consecutiveDaysWithoutWater, Is.EqualTo(5));
            Assert.That(_plants.GetPlantState("farm", new Vector2Int(5, 6)).consecutiveDaysWithoutWater, Is.EqualTo(3));
            _plants.OnEvent(new NewDayEvent());
            Assert.That(_plants.GetPlantState("farm", position).daysPassedSincePlanting, Is.EqualTo(5));
            Assert.That(wilted.daysPassedSincePlanting, Is.EqualTo(2));
            Assert.That(_plants.GetPlantState("farm", new Vector2Int(5, 6)).consecutiveDaysWithoutWater, Is.EqualTo(4));
            Assert.That(land.irrigated, Is.False);
            Assert.That(_growth.Single().NewStageIndex, Is.EqualTo(2));
        }

        [Test]
        public void UnwateredPlantsStayAtTheirStageAndAccumulateConsecutiveDryDays()
        {
            var plant = Store("farm", "plant:1,1", 1, false);
            _plants.OnEvent(new NewDayEvent());
            _plants.OnEvent(new NewDayEvent());
            Assert.That(plant.daysPassedSincePlanting, Is.EqualTo(1));
            Assert.That(plant.consecutiveDaysWithoutWater, Is.EqualTo(2));
            Assert.That(plant.condition, Is.EqualTo(PlantCondition.Healthy));
            Assert.That(_growth, Is.Empty);
            Assert.That(_conditionChanges, Is.Empty);
        }

        [TestCase(1)]
        [TestCase(3)]
        [TestCase(5)]
        public void WiltUsesTheCropThresholdAndIsAnnouncedExactlyOnce(int threshold)
        {
            typeof(PlantData).GetField("daysWithoutWaterUntilWilt", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_data, threshold);
            var plant = Store("village", "plant:-3,4", 1, false);
            for (var day = 1; day <= threshold; day++)
            {
                _plants.OnEvent(new NewDayEvent { Day = day });
                Assert.That(plant.condition, Is.EqualTo(day == threshold ? PlantCondition.Wilted : PlantCondition.Healthy));
            }
            Assert.That(_conditionChanges.Count, Is.EqualTo(1));
            Assert.That(_conditionChanges[0].LocationId, Is.EqualTo("village"));
            Assert.That(_conditionChanges[0].Position, Is.EqualTo(new Vector2Int(-3, 4)));
            Assert.That(_conditionChanges[0].PreviousCondition, Is.EqualTo(PlantCondition.Healthy));
            Assert.That(_conditionChanges[0].Condition, Is.EqualTo(PlantCondition.Wilted));
            GameState.World.Set("village", "farmland:-3,4", new FarmlandState { plowed = true, irrigated = true });
            _plants.OnEvent(new NewDayEvent());
            Assert.That(plant.condition, Is.EqualTo(PlantCondition.Wilted));
            Assert.That(plant.daysPassedSincePlanting, Is.EqualTo(1));
            Assert.That(_conditionChanges.Count, Is.EqualTo(1));
            Assert.That(_plants.HasPlantAt("village", new Vector2Int(-3, 4)), Is.True);
        }

        [Test]
        public void WateringResetsTheDryStreakButMustBeRepeatedAfterTheDailyDrying()
        {
            var plant = Store("farm", "plant:1,1", 0, false);
            _plants.OnEvent(new NewDayEvent());
            _plants.OnEvent(new NewDayEvent());
            GameState.World.Set("farm", "farmland:1,1", new FarmlandState { plowed = true, irrigated = true });
            _plants.OnEvent(new NewDayEvent());
            Assert.That(plant.daysPassedSincePlanting, Is.EqualTo(1));
            Assert.That(plant.consecutiveDaysWithoutWater, Is.Zero);
            _plants.OnEvent(new NewDayEvent());
            Assert.That(plant.daysPassedSincePlanting, Is.EqualTo(1));
            Assert.That(plant.consecutiveDaysWithoutWater, Is.EqualTo(1));
        }

        [Test]
        public void EveryLocationDriesIncludingEmptyPlotsAndMissingDefinitions()
        {
            Store("farm", "plant:1,1", 0);
            Store("village", "plant:2,2", 0);
            GameState.World.Set("village", "plant:2,2", new PlantState("missing:crop"));
            GameState.World.Set("empty-map", "farmland:9,9", new FarmlandState { plowed = true, irrigated = true });
            GameState.World.Set("empty-map", "farmland:8,8", new FarmlandState { irrigated = true });
            _plants.OnEvent(new NewDayEvent());
            Assert.That(GameState.World.GetStates<FarmlandState>().All(entry => !entry.State.irrigated), Is.True);
            Assert.That(_dried.Count, Is.EqualTo(4));
            Assert.That(GameState.World.GetStates<FarmlandState>().All(entry => entry.State.plowed), Is.True);
            Assert.That(_plants.GetPlantState("village", new Vector2Int(2, 2)).consecutiveDaysWithoutWater, Is.Zero);
            _plants.OnEvent(new NewDayEvent());
            Assert.That(_dried.Count, Is.EqualTo(4), "Already dry plots do not publish another dry event.");
        }

        [Test]
        public void GrowthCallbacksCanWaterForTheNewDayWithoutBeingDriedAgain()
        {
            var plant = Store("farm", "plant:1,1", 1);
            _onGrowth = e => GameState.World.Set("farm", "farmland:1,1",
                new FarmlandState { plowed = true, irrigated = true });
            _plants.OnEvent(new NewDayEvent());
            Assert.That(plant.daysPassedSincePlanting, Is.EqualTo(2));
            Assert.That(GameState.World.TryGet("farm", "farmland:1,1", out FarmlandState land), Is.True);
            Assert.That(land.irrigated, Is.True);
            _plants.OnEvent(new NewDayEvent());
            Assert.That(plant.daysPassedSincePlanting, Is.EqualTo(3));
            Assert.That(land.irrigated, Is.False);
        }

        private PlantState Store(string location, string id, int age, bool irrigated = true)
        {
            var state = new PlantState(_data.plantId) { daysPassedSincePlanting = age };
            GameState.World.Set(location, id, state);
            if (irrigated)
                GameState.World.Set(location, id.Replace("plant:", "farmland:"),
                    new FarmlandState { plowed = true, irrigated = true });
            return state;
        }

        private void Sow(string location, Vector2Int position, string id) => typeof(PlantManager)
            .GetMethod("SowPlantOnMap", BindingFlags.Instance | BindingFlags.NonPublic)
            .Invoke(_plants, new object[] { location, position, id });

        public void OnEvent(PlantGrowthEvent e)
        {
            _growth.Add(e);
            _onGrowth?.Invoke(e);
        }

        public void OnEvent(SowPlantEvent e) => _sown.Add(e);
        public void OnEvent(PlantConditionChangedEvent e)
        {
            Assert.That(_plants.GetPlantState(e.LocationId, e.Position).condition, Is.EqualTo(e.Condition));
            _conditionChanges.Add(e);
        }
        public void OnEvent(FarmlandDriedEvent e) => _dried.Add(e);
    }
}
