using TestConfiguration = Core.Common.Editor.ConfigurationTestData;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Core.Events;
using Core.Common;
using Core.Game;
using Core.Inventory;
using Core.Inventory.Editor;
using Core.Items;
using Core.TimeAndWeather;
using Core.Tile;
using NUnit.Framework;
using Sirenix.Serialization;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Plants.Editor
{
    [Category("FarmingTerrain")]
    public sealed class PlantHarvestTests : IEventListener<PlantHarvestedEvent>, IEventListener<InventoryChangedEvent>, IEventListener<PlantRemovedEvent>
    {
        private GameObject _root;
        private Core.Common.Editor.GameTestFixture _fixture;
        private PlantManager _plants;
        private PlantCatalog _catalog;
        private PlantData _data;
        private InventoryTestItem _item;
        private SlotInventory _inventory;
        private PlantState _crop;
        private Sprite _sprite;
        private int _harvestEvents;
        private int _inventoryEvents;
        private Action _onNotification;
        private PlantHarvestedEvent _lastHarvest;
        private PlantRemovedEvent _lastRemoval;
        private int _removalEvents;
        private readonly List<WorldItem> _drops = new();

        [SetUp]
        public void SetUp()
        {
            _fixture = new Core.Common.Editor.GameTestFixture();
            _fixture.AddSingleton<GameStateManager>();
            _fixture.AddSingleton<PlantManager>();
            _harvestEvents = _inventoryEvents = 0;
            _removalEvents = 0;
            _onNotification = null;
            _root = _fixture.Root;
            _plants = PlantManager.Instance;
            _data = ScriptableObject.CreateInstance<PlantData>();
            TestConfiguration.Set(_data, "plantId", "test:crop");
            var stages = PlantDataTests.Stages(0, 2, 5);
            _sprite = Sprite.Create(Texture2D.whiteTexture, new Rect(0, 0, 1, 1), Vector2.zero);
            foreach (var stage in stages) Set(stage, "_representation", new SpriteOrPrefab { sprite = _sprite });
            Set(stages[2], "_isHarvestable", true);
            Set(_data, "growthStages", stages);
            _item = ScriptableObject.CreateInstance<InventoryTestItem>();
            Set(_item, "_itemId", "test:produce", typeof(ItemDefinition));
            Set(_data, "_harvestItem", _item);
            Set(_data, "_minHarvestQuantity", 3);
            Set(_data, "_maxHarvestQuantity", 3);
            _catalog = ScriptableObject.CreateInstance<PlantCatalog>();
            _catalog.Synchronize(new Object[] { _data });
            typeof(PlantManager).GetField("_catalog", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(PlantManager.Instance, _catalog);
            _inventory = _root.AddComponent<SlotInventory>();
            GameState.Player.Inventory.Slots = new InventorySlotState[2];
            _inventory.Bind(GameState.Player.Inventory, id => id == _item.ItemId ? _item : null);
            _crop = new PlantState(_data.plantId) { daysPassedSincePlanting = 8 };
            GameState.World.Set("farm", "plant:1,2", _crop);
            EventBus<PlantHarvestedEvent>.Subscribe(this);
            EventBus<InventoryChangedEvent>.Subscribe(this);
            EventBus<PlantRemovedEvent>.Subscribe(this);
        }

        [TearDown]
        public void TearDown()
        {
            EventBus<PlantHarvestedEvent>.Unsubscribe(this);
            EventBus<InventoryChangedEvent>.Unsubscribe(this);
            EventBus<PlantRemovedEvent>.Unsubscribe(this);
            _fixture?.Dispose();
            Object.DestroyImmediate(_catalog);
            Object.DestroyImmediate(_data);
            Object.DestroyImmediate(_item);
            Object.DestroyImmediate(_sprite);
            foreach (var drop in _drops) if (drop) Object.DestroyImmediate(drop.gameObject);
            _drops.Clear();
        }

        [TestCase(HarvestMethod.Picking)]
        public void HarvestAwardsTheConfiguredYieldAndRemovesOnlyItsOwnCrop(HarvestMethod method)
        {
            Set(_data, "_harvestMethod", method);
            var other = new PlantState(_data.plantId) { daysPassedSincePlanting = 8 };
            GameState.World.Set("village", "plant:1,2", other);
            GameState.World.Set("farm", "farmland:1,2", new FarmlandState { plowed = true, irrigated = true });
            _onNotification = () =>
            {
                Assert.That(_plants.HasPlantAt("farm", new Vector2Int(1, 2)), Is.False);
                Assert.That(_inventory.GetSnapshot().Sum(stack => stack.Quantity), Is.EqualTo(3));
                Assert.That(Harvest(method), Is.False, "Callbacks must not harvest the same crop twice.");
            };
            Assert.That(Harvest(method), Is.True);
            Assert.That(_plants.GetPlantState("village", new Vector2Int(1, 2)), Is.SameAs(other));
            Assert.That(GameState.World.TryGet("farm", "farmland:1,2", out FarmlandState land), Is.True);
            Assert.That(land.plowed && land.irrigated, Is.True);
            Assert.That(_harvestEvents, Is.EqualTo(1));
            Assert.That(_inventoryEvents, Is.EqualTo(1));
        }

        [TestCase(-1)]
        [TestCase(1)]
        public void ScytheDropsTheYieldAtTheCropEvenWhenInventoryIsFull(int regrowthStage)
        {
            Set(_data, "_harvestMethod", HarvestMethod.Scythe);
            Set(_data, "_regrowthStageIndex", regrowthStage);
            GameState.Player.Inventory.Slots = new[] { new InventorySlotState(_item.ItemId, _item.MaxStackSize), new InventorySlotState(_item.ItemId, _item.MaxStackSize) };
            var before = GameState.Player.Inventory.Slots;
            var point = new Vector3(7, -3, 0);
            Assert.That(_plants.TryHarvestWithScythe("farm", new Vector2Int(1, 2), point, out var drop), Is.True);
            _drops.Add(drop);
            Assert.That(drop.Item, Is.SameAs(_item));
            Assert.That(drop.Quantity, Is.EqualTo(3));
            Assert.That(drop.transform.position, Is.EqualTo(point));
            Assert.That(drop.gameObject.activeSelf, Is.True);
            Assert.That(drop.GetComponents<UnityEngine.Rendering.SortingGroup>(), Has.Length.EqualTo(1));
            // An inactive configured drop's first Awake must not duplicate its visual or sorting.
            typeof(WorldItem).GetMethod("Awake", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(drop, null);
            Assert.That(drop.transform.childCount, Is.EqualTo(1));
            Assert.That(drop.GetComponents<UnityEngine.Rendering.SortingGroup>(), Has.Length.EqualTo(1));
            Assert.That(GameState.Player.Inventory.Slots, Is.SameAs(before));
            Assert.That(_plants.HasPlantAt("farm", new Vector2Int(1, 2)), Is.EqualTo(regrowthStage >= 0));
            if (regrowthStage >= 0) Assert.That(_crop.daysPassedSincePlanting, Is.EqualTo(2));
            Assert.That(_plants.TryHarvestWithScythe("farm", new Vector2Int(1, 2), point, out _), Is.False);
            Assert.That(_lastHarvest.Method, Is.EqualTo(HarvestMethod.Scythe));
            Assert.That(_harvestEvents, Is.EqualTo(1));
            Assert.That(_inventoryEvents, Is.Zero);
        }

        [Test]
        public void PickingCropsCannotBeCutAndScytheCropsCannotDeliverDirectlyToInventory()
        {
            Assert.That(_plants.TryHarvestWithScythe("farm", new Vector2Int(1, 2), Vector3.zero, out var drop), Is.False);
            Assert.That(drop, Is.Null);
            Set(_data, "_harvestMethod", HarvestMethod.Scythe);
            Assert.That(Harvest(HarvestMethod.Scythe), Is.False);
            Assert.That(_harvestEvents + _inventoryEvents, Is.Zero);
            Assert.That(_plants.GetPlantState("farm", new Vector2Int(1, 2)), Is.SameAs(_crop));
        }

        [Test]
        public void ARegrowingCropReturnsToAnEarlierStageAndMustGrowAgainBeforeAnotherHarvest()
        {
            Set(_data, "_regrowthStageIndex", 1);
            _onNotification = () =>
            {
                Assert.That(_crop.daysPassedSincePlanting, Is.EqualTo(2));
                Assert.That(_plants.CanHarvest("farm", new Vector2Int(1, 2), HarvestMethod.Picking), Is.False);
            };
            Assert.That(Harvest(HarvestMethod.Picking), Is.True);
            _onNotification = null;
            Assert.That(_plants.GetPlantState("farm", new Vector2Int(1, 2)), Is.SameAs(_crop));
            for (var day = 0; day < 3; day++)
            {
                GameState.World.Set("farm", "farmland:1,2", new FarmlandState { plowed = true, irrigated = true });
                _plants.OnEvent(new NewDayEvent());
            }
            Assert.That(_crop.daysPassedSincePlanting, Is.EqualTo(5));
            Assert.That(Harvest(HarvestMethod.Picking), Is.True);
            Assert.That(_inventory.GetSnapshot().Sum(stack => stack.Quantity), Is.EqualTo(6));
        }

        [TestCase("immature")]
        [TestCase("wilted")]
        [TestCase("wrong-method")]
        [TestCase("disabled")]
        [TestCase("full-inventory")]
        public void FailedHarvestDoesNotChangeTheCropInventoryOrPublishEvents(string fault)
        {
            switch (fault)
            {
                case "immature": _crop.daysPassedSincePlanting = 2; break;
                case "wilted": _crop.condition = PlantCondition.Wilted; break;
                case "wrong-method": Set(_data, "_harvestMethod", HarvestMethod.Scythe); break;
                case "disabled": _catalog.SetEnabled(_data, false); break;
                case "full-inventory":
                    GameState.Player.Inventory.Slots = new[] { new InventorySlotState(_item.ItemId, _item.MaxStackSize), new InventorySlotState(_item.ItemId, _item.MaxStackSize) };
                    break;
            }
            var slots = GameState.Player.Inventory.Slots;
            var days = _crop.daysPassedSincePlanting;
            Assert.That(Harvest(HarvestMethod.Picking), Is.False);
            Assert.That(_plants.GetPlantState("farm", new Vector2Int(1, 2)), Is.SameAs(_crop));
            Assert.That(_crop.daysPassedSincePlanting, Is.EqualTo(days));
            Assert.That(GameState.Player.Inventory.Slots, Is.SameAs(slots));
            Assert.That(_harvestEvents + _inventoryEvents, Is.Zero);
        }

        [Test]
        public void HarvestedInventoryAndRegrowthAgePersistTogether()
        {
            Set(_data, "_regrowthStageIndex", 1);
            Assert.That(Harvest(HarvestMethod.Picking), Is.True);
            var save = new GameSaveData();
            save.player.Inventory.Slots = GameState.Player.Inventory.Slots;
            save.world.Set("farm", "plant:1,2", _crop);
            var bytes = SerializationUtility.SerializeValue(save, DataFormat.Binary);
            var restored = SerializationUtility.DeserializeValue<GameSaveData>(bytes, DataFormat.Binary);
            Assert.That(restored.world.TryGet("farm", "plant:1,2", out PlantState crop), Is.True);
            Assert.That(crop.daysPassedSincePlanting, Is.EqualTo(2));
            Assert.That(restored.player.Inventory.Slots[0].ItemId, Is.EqualTo("test:produce"));
            Assert.That(restored.player.Inventory.Slots[0].Quantity, Is.EqualTo(3));
        }

        [Test]
        public void PickingInteractionAndStagePrefabReturnToTheRegrowthStageAfterHarvest()
        {
            Set(_data, "_regrowthStageIndex", 1);
            var root = new GameObject("Bound crop");
            root.SetActive(false);
            try
            {
                var view = root.AddComponent<FarmablePlant>();
                view.Bind("farm", new Vector2Int(1, 2), _data, _crop);
                var picking = root.GetComponent<PlantHarvestInteractable>();
                Assert.That(picking.CanInteract, Is.True);
                var oldStage = root.transform.GetChild(0).gameObject;
                Assert.That(root.GetComponent<PlantHarvestInteractable>().TryHarvest(_inventory), Is.True);
                view.OnEvent(_lastHarvest);
                Assert.That(oldStage == null || !oldStage.activeSelf, Is.True);
                Assert.That(picking.CanInteract, Is.False);
                Assert.That(root.transform.childCount, Is.EqualTo(1));
                Assert.That(root.GetComponent<FarmablePlant>(), Is.SameAs(view));
                // A growth event queued before harvesting cannot restore the mature presentation.
                var regrown = root.transform.GetChild(0).gameObject;
                view.OnEvent(new PlantGrowthEvent { LocationId = "farm", Position = new Vector2Int(1, 2), NewStageIndex = 2 });
                Assert.That(picking.CanInteract, Is.False);
                Assert.That(root.transform.GetChild(0).gameObject, Is.SameAs(regrown));
                Set(_data, "_harvestMethod", HarvestMethod.Scythe);
                _crop.daysPassedSincePlanting = 5;
                Assert.That(picking.CanInteract, Is.False);
                Assert.That(_plants.CanHarvest("farm", new Vector2Int(1, 2), HarvestMethod.Scythe), Is.True);
            }
            finally { Object.DestroyImmediate(root); }
        }

        [Test]
        public void ARemovedCropViewDisablesItsRootAndCannotConsumeAnotherPlantsHarvest()
        {
            var root = new GameObject("Bound crop");
            root.SetActive(false);
            var view = root.AddComponent<FarmablePlant>();
            view.Bind("farm", new Vector2Int(1, 2), _data, _crop);
            view.OnEvent(new PlantHarvestedEvent { LocationId = "farm", Position = new Vector2Int(1, 2),
                Removed = true, State = new PlantState(_data.plantId) });
            Assert.That(root, Is.Not.Null);
            Assert.That(root.GetComponent<PlantHarvestInteractable>().TryHarvest(_inventory), Is.True);
            view.OnEvent(_lastHarvest);
            Assert.That(root == null || !root.activeSelf, Is.True);
            if (root) Object.DestroyImmediate(root);
        }

        private bool Harvest(HarvestMethod method) => _plants.TryHarvest("farm", new Vector2Int(1, 2), method, _inventory);

        [TestCase(HarvestMethod.Picking)]
        [TestCase(HarvestMethod.Scythe)]
        public void WiltedCropsCanBeClearedByInteractionWithoutToolYieldOrInventorySpace(HarvestMethod method)
        {
            Set(_data, "_harvestMethod", method);
            _crop.condition = PlantCondition.Wilted;
            GameState.Player.Inventory.Slots = new[] { new InventorySlotState(_item.ItemId, _item.MaxStackSize), new InventorySlotState(_item.ItemId, _item.MaxStackSize) };
            var slots = GameState.Player.Inventory.Slots;
            var actor = _root.AddComponent<Character.GameCharacter>();
            Set(actor, "<MainInventory>k__BackingField", _inventory);
            var root = new GameObject("Wilted crop");
            root.SetActive(false);
            try
            {
                var view = root.AddComponent<FarmablePlant>();
                view.Bind("farm", new Vector2Int(1, 2), _data, _crop);
                var picking = root.GetComponent<PlantHarvestInteractable>();
                Assert.That(picking.CanInteract, Is.True);
                picking.TriggerInteraction(actor);
                Assert.That(_plants.HasPlantAt("farm", new Vector2Int(1, 2)), Is.False);
                Assert.That(picking.CanInteract, Is.False);
                Assert.That(_plants.TryClearWilted("farm", new Vector2Int(1, 2)), Is.False);
                Assert.That(GameState.Player.Inventory.Slots, Is.SameAs(slots));
                Assert.That(_harvestEvents + _inventoryEvents, Is.Zero);
                Assert.That(_removalEvents, Is.EqualTo(1));
                view.OnEvent(_lastRemoval);
                Assert.That(root == null || !root.activeSelf, Is.True);
            }
            finally { if (root) Object.DestroyImmediate(root); }
        }

        [Test]
        public void HealthyCropsCannotBeClearedAsWilted()
        {
            Assert.That(_plants.TryClearWilted("farm", new Vector2Int(1, 2)), Is.False);
            Assert.That(_plants.GetPlantState("farm", new Vector2Int(1, 2)), Is.SameAs(_crop));
        }

        [Test]
        public void WiltAgeSurvivesSavingAndLoading()
        {
            _crop.condition = PlantCondition.Wilted;
            _crop.daysSinceWilted = 3;
            var bytes = SerializationUtility.SerializeValue(_crop, DataFormat.Binary);
            var restored = SerializationUtility.DeserializeValue<PlantState>(bytes, DataFormat.Binary);
            Assert.That(restored.daysSinceWilted, Is.EqualTo(3));
            Assert.That(restored.condition, Is.EqualTo(PlantCondition.Wilted));
        }

        [Test]
        public void AFullInventoryRestoresTheVisibilityOfADropThatAlreadyStartedFading()
        {
            GameState.Player.Inventory.Slots = new[] { new InventorySlotState(_item.ItemId, _item.MaxStackSize), new InventorySlotState(_item.ItemId, _item.MaxStackSize) };
            var actor = _root.AddComponent<Character.GameCharacter>();
            Set(actor, "<MainInventory>k__BackingField", _inventory);
            var root = new GameObject("Fading drop");
            root.SetActive(false);
            try
            {
                var drop = root.AddComponent<WorldItem>();
                drop.Initialize(_item, 3);
                Set(drop, "_character", actor);
                Set(drop, "_isFading", true);
                var renderer = root.GetComponentInChildren<SpriteRenderer>(true);
                renderer.color = new Color(1, 1, 1, 0);
                typeof(WorldItem).GetMethod("TryPickup", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(drop, null);
                Assert.That(renderer.color.a, Is.EqualTo(1));
                Assert.That(root, Is.Not.Null);
                Assert.That(drop.Quantity, Is.EqualTo(3));
                Assert.That(_inventoryEvents, Is.Zero);
            }
            finally { Object.DestroyImmediate(root); }
        }

        [Test]
        public void WiltClearingFeedbackSurvivesCropRemovalWithPrefabOwnedPlaybackAndCleanup()
        {
            _crop.condition = PlantCondition.Wilted;
            var source = UnityEditor.AssetDatabase.LoadAssetAtPath<MoreMountains.Feedbacks.MMF_Player>(
                "Assets/Plants/Feedbacks/ClearWiltedCropFeedback.prefab");
            Assert.That(source, Is.Not.Null);
            Set(_data, "_wiltedFeedbackPrefab", source);
            var root = new GameObject("Wilted crop");
            root.SetActive(false);
            root.transform.position = new Vector3(7, 3, 0);
            MoreMountains.Feedbacks.MMF_Player feedback = null;
            FarmablePlant view = null;
            try
            {
                view = root.AddComponent<FarmablePlant>();
                view.Bind("farm", new Vector2Int(1, 2), _data, _crop);
                // Subscribe the view without activating scene components in this EditMode fixture.
                EventBus<PlantRemovedEvent>.Subscribe(view);
                Assert.That(root.GetComponent<PlantHarvestInteractable>().TryClearWilted(), Is.True);
                Assert.That(root == null || !root.activeSelf, Is.True);
                feedback = Object.FindObjectsByType<MoreMountains.Feedbacks.MMF_Player>(FindObjectsSortMode.None)
                    .Single(player => player.name == source.name + "(Clone)");
                Assert.That(feedback.transform.parent, Is.Null);
                Assert.That(feedback.transform.position, Is.EqualTo(new Vector3(7, 3, 0)));
                Assert.That(feedback.AutoPlayOnStart, Is.True);
                var cleanup = feedback.GetComponent<MoreMountains.Tools.MMTimedDestruction>();
                Assert.That(cleanup, Is.Not.Null);
                Assert.That(cleanup.TimeDestructionMode,
                    Is.EqualTo(MoreMountains.Tools.MMTimedDestruction.TimedDestructionModes.Destroy));
                var sound = feedback.FeedbacksList.OfType<MoreMountains.Feedbacks.MMF_Sound>().Single();
                Assert.That(cleanup.TimeBeforeDestruction, Is.GreaterThan(sound.Sfx.length));
            }
            finally
            {
                if (!ReferenceEquals(view, null)) EventBus<PlantRemovedEvent>.Unsubscribe(view);
                if (feedback) Object.DestroyImmediate(feedback.gameObject);
                if (root) Object.DestroyImmediate(root);
            }
        }

        public void OnEvent(PlantRemovedEvent removal)
        {
            _removalEvents++;
            _lastRemoval = removal;
            Assert.That(_plants.GetPlantState(removal.LocationId, removal.Position), Is.Null);
        }

        [TestCase(HarvestMethod.Picking)]
        [TestCase(HarvestMethod.Scythe)]
        public void VariableYieldIsRolledOnceAndMatchesDeliveredItemsAndEvent(HarvestMethod method)
        {
            Set(_data, "_harvestMethod", method);
            Set(_data, "_minHarvestQuantity", 2);
            Set(_data, "_maxHarvestQuantity", 8);
            var previousRandomState = UnityEngine.Random.state;
            try
            {
                UnityEngine.Random.InitState(321);
                var expectedQuantity = _data.RollHarvestQuantity();
                var expectedNextRoll = _data.RollHarvestQuantity();
                UnityEngine.Random.InitState(321);
                Assert.That(_plants.CanHarvest("farm", new Vector2Int(1, 2), method), Is.True);
                if (method == HarvestMethod.Picking)
                {
                    Assert.That(Harvest(method), Is.True);
                    Assert.That(_inventory.GetSnapshot().Sum(stack => stack.Quantity), Is.EqualTo(expectedQuantity));
                }
                else
                {
                    Assert.That(_plants.TryHarvestWithScythe("farm", new Vector2Int(1, 2), Vector3.zero, out var drop), Is.True);
                    _drops.Add(drop);
                    Assert.That(drop.Quantity, Is.EqualTo(expectedQuantity));
                }
                Assert.That(_lastHarvest.Quantity, Is.EqualTo(expectedQuantity));
                Assert.That(_data.RollHarvestQuantity(), Is.EqualTo(expectedNextRoll));
            }
            finally { UnityEngine.Random.state = previousRandomState; }
        }

        [TestCase(false)]
        [TestCase(true)]
        public void PickingEntryPointHarvestsOnceOrLeavesAFullInventoryUnchanged(bool fullInventory)
        {
            Set(_data, "_regrowthStageIndex", 1);
            if (fullInventory)
                GameState.Player.Inventory.Slots = new[] { new InventorySlotState(_item.ItemId, _item.MaxStackSize), new InventorySlotState(_item.ItemId, _item.MaxStackSize) };
            var actor = _root.AddComponent<Character.GameCharacter>();
            Set(actor, "<MainInventory>k__BackingField", _inventory);
            var root = new GameObject("Bound crop");
            root.SetActive(false);
            try
            {
                var view = root.AddComponent<FarmablePlant>();
                view.Bind("farm", new Vector2Int(1, 2), _data, _crop);
                root.GetComponent<PlantHarvestInteractable>().TriggerInteraction(actor);
                Assert.That(_harvestEvents, Is.EqualTo(fullInventory ? 0 : 1));
                Assert.That(_inventoryEvents, Is.EqualTo(fullInventory ? 0 : 1));
                Assert.That(_crop.daysPassedSincePlanting, Is.EqualTo(fullInventory ? 8 : 2));
            }
            finally { Object.DestroyImmediate(root); }
        }
        public void OnEvent(PlantHarvestedEvent harvest)
        {
            _lastHarvest = harvest;
            _harvestEvents++;
            Assert.That(harvest.State, Is.SameAs(_crop));
            Assert.That(harvest.ItemId, Is.EqualTo(_item.ItemId));
            Assert.That(harvest.Quantity, Is.InRange(_data.MinHarvestQuantity, _data.MaxHarvestQuantity));
            Assert.That(harvest.Removed, Is.EqualTo(_data.RegrowthStageIndex < 0));
            _onNotification?.Invoke();
        }
        public void OnEvent(InventoryChangedEvent change)
        {
            if (change.InventoryRef != _inventory) return;
            _inventoryEvents++;
            _onNotification?.Invoke();
        }
        private static void Set(object target, string name, object value, Type type = null) =>
            (type ?? target.GetType()).GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(target, value);
    }
}
