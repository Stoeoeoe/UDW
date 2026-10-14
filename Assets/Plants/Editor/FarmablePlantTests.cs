using System;
using System.Reflection;
using Core.Common;
using Core.Game;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Plants.Editor
{
    [ExecuteAlways]
    public sealed class GrowthStageActivationProbe : MonoBehaviour
    {
        public int EnableCount;
        public Vector3 EnabledAt;
        public FarmablePlant Owner;
        private void OnEnable()
        {
            EnableCount++;
            EnabledAt = transform.position;
            Owner = GetComponentInParent<FarmablePlant>();
        }
    }

    [Category("FarmingTerrain")]
    public sealed class FarmablePlantTests
    {
        private GameObject _root;
        private PlantData _data;
        private FarmablePlant _view;
        private Core.Common.Editor.GameTestFixture _fixture;
        private PlantState _state;
        private PlantCatalog _catalog;
        private Sprite _sprite;

        [SetUp]
        public void SetUp()
        {
            _fixture = new Core.Common.Editor.GameTestFixture();
            _fixture.AddSingleton<GameStateManager>();
            _fixture.AddSingleton<PlantManager>();
            _root = new GameObject("Crop visual tests");
            _root.SetActive(false);
            _view = _root.AddComponent<FarmablePlant>();
            _state = new PlantState("test:crop");
            GameState.World.Set("farm", "plant:1,1", _state);
            _data = ScriptableObject.CreateInstance<PlantData>();
            Core.Common.Editor.ConfigurationTestData.Set(_data, "plantId", _state.plantID);
            _sprite = Sprite.Create(Texture2D.whiteTexture, new Rect(0, 0, 1, 1), Vector2.zero);
            var stages = PlantDataTests.Stages(0, 2);
            foreach (var stage in stages)
                stage.GetType().GetField("_representation", BindingFlags.Instance | BindingFlags.NonPublic)
                    .SetValue(stage, new SpriteOrPrefab { sprite = _sprite });
            typeof(PlantData).GetField("growthStages", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_data, stages);
            _catalog = ScriptableObject.CreateInstance<PlantCatalog>();
            _catalog.Synchronize(new Object[] { _data });
            typeof(PlantManager).GetField("_catalog", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(PlantManager.Instance, _catalog);
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_root);
            _fixture?.Dispose();
            Object.DestroyImmediate(_catalog);
            Object.DestroyImmediate(_data);
            Object.DestroyImmediate(_sprite);
        }

        [Test]
        public void BindRejectsAStateThatIsNotTheCropStoredAtItsTile()
        {
            Assert.Throws<InvalidOperationException>(() =>
                _view.Bind("farm", Vector2Int.one, _data, new PlantState(_state.plantID)));
            Assert.That(_root.GetComponent<PlantHarvestInteractable>(), Is.Null);
        }

        [Test]
        public void WiltedStateRestoresTheFallbackTintOnLoad()
        {
            BindView(2, PlantCondition.Wilted);
            var renderer = _root.GetComponentInChildren<SpriteRenderer>(true);
            Assert.That(renderer.color, Is.EqualTo(new Color(0.55f, 0.45f, 0.3f, 1f)));
        }

        [Test]
        public void WiltNotificationsOnlyAffectTheirOwnCropAndBlockFurtherGrowthVisuals()
        {
            BindView();
            var renderer = _root.GetComponentInChildren<SpriteRenderer>(true);
            _view.OnEvent(new PlantConditionChangedEvent { PreviousCondition = PlantCondition.Healthy, Condition = PlantCondition.Wilted, LocationId = "village", Position = Vector2Int.one });
            _view.OnEvent(new PlantConditionChangedEvent { PreviousCondition = PlantCondition.Healthy, Condition = PlantCondition.Wilted, LocationId = "farm", Position = Vector2Int.zero });
            Assert.That(renderer.color, Is.EqualTo(Color.white));
            _state.condition = PlantCondition.Wilted;
            _view.OnEvent(new PlantConditionChangedEvent { PreviousCondition = PlantCondition.Healthy, Condition = PlantCondition.Wilted, LocationId = "farm", Position = Vector2Int.one });
            Assert.That(renderer.color, Is.Not.EqualTo(Color.white));
            _view.OnEvent(new PlantGrowthEvent { LocationId = "farm", Position = Vector2Int.one, NewStageIndex = 1 });
            Assert.That(_root.GetComponentInChildren<SpriteRenderer>(true), Is.SameAs(renderer));
        }

        [Test]
        public void WiltedStateCanRestoreAnAuthoredWiltedPrefabInsteadOfTheGrowthStage()
        {
            var prefab = new GameObject("Wilted crop");
            prefab.transform.SetParent(_root.transform, false);
            prefab.AddComponent<SpriteRenderer>().color = Color.red;
            typeof(PlantData).GetField("_wiltedRepresentation", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_data, new SpriteOrPrefab { type = SpriteOrPrefab.SpriteOrPrefabType.Prefab, prefab = prefab });
            BindView(0, PlantCondition.Wilted);
            Assert.That(_root.transform.childCount, Is.EqualTo(2));
            Assert.That(_root.transform.GetChild(1).GetComponent<SpriteRenderer>().color, Is.EqualTo(Color.red));
        }

        [Test]
        public void GrowthSwapsWholePrefabsAndTheirCollidersWhileKeepingThePlantRoot()
        {
            var templates = new GameObject("Stage templates");
            templates.SetActive(false);
            try
            {
                var seed = new GameObject("Seed stage");
                seed.transform.SetParent(templates.transform, false);
                seed.AddComponent<BoxCollider2D>();
                var mature = new GameObject("Mature stage");
                mature.transform.SetParent(templates.transform, false);
                mature.AddComponent<CircleCollider2D>();
                SetRepresentation(0, seed);
                SetRepresentation(1, mature);
                BindView();
                var oldStage = _root.transform.GetChild(0).gameObject;
                Assert.That(oldStage.GetComponent<BoxCollider2D>(), Is.Not.Null);
                _view.OnEvent(new PlantGrowthEvent { LocationId = "elsewhere", Position = Vector2Int.one, NewStageIndex = 1 });
                Assert.That(_root.transform.GetChild(0).gameObject, Is.SameAs(oldStage));
                _state.daysPassedSincePlanting = 2;
                _view.OnEvent(new PlantGrowthEvent { LocationId = "farm", Position = Vector2Int.one, NewStageIndex = 1 });
                Assert.That(oldStage == null || !oldStage.activeSelf, Is.True);
                Assert.That(_root.transform.GetChild(0).GetComponent<CircleCollider2D>(), Is.Not.Null);
                Assert.That(_root.GetComponent<FarmablePlant>(), Is.SameAs(_view));
                Assert.That(_root.GetComponent<PlantHarvestInteractable>(), Is.Not.Null);
            }
            finally { Object.DestroyImmediate(templates); }
        }

        [Test]
        public void StageComponentsEnableOnlyAfterParentingAndPlacementAreComplete()
        {
            var templates = new GameObject("Stage templates");
            templates.SetActive(false);
            try
            {
                var mature = new GameObject("Mature stage");
                mature.transform.SetParent(templates.transform, false);
                mature.AddComponent<GrowthStageActivationProbe>();
                SetRepresentation(1, mature);
                _root.transform.position = new Vector3(12, -4, 0);
                BindView();
                _root.SetActive(true);
                _state.daysPassedSincePlanting = 2;
                _view.OnEvent(new PlantGrowthEvent { LocationId = "farm", Position = Vector2Int.one, NewStageIndex = 1 });
                var probe = _root.GetComponentInChildren<GrowthStageActivationProbe>();
                Assert.That(probe.EnableCount, Is.EqualTo(1));
                Assert.That(probe.EnabledAt, Is.EqualTo(_root.transform.position));
                Assert.That(probe.Owner, Is.SameAs(_view));
            }
            finally { Object.DestroyImmediate(templates); }
        }

        private void BindView(int growthDays = 0, PlantCondition condition = PlantCondition.Healthy)
        {
            _state.daysPassedSincePlanting = growthDays;
            _state.condition = condition;
            _view.Bind("farm", Vector2Int.one, _data, _state);
        }

        private void SetRepresentation(int stage, GameObject prefab) => _data.GrowthStages[stage].GetType()
            .GetField("_representation", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(_data.GrowthStages[stage],
                new SpriteOrPrefab { type = SpriteOrPrefab.SpriteOrPrefabType.Prefab, prefab = prefab });
    }
}
