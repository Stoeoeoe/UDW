using System.Reflection;
using Core.Common;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Plants.Editor
{
    [Category("FarmingTerrain")]
    public sealed class FarmablePlantTests
    {
        private GameObject _root;
        private PlantData _data;
        private FarmablePlant _view;

        [SetUp]
        public void SetUp()
        {
            _root = new GameObject("Crop visual tests");
            _root.SetActive(false);
            _view = _root.AddComponent<FarmablePlant>();
            _data = ScriptableObject.CreateInstance<PlantData>();
            var stages = PlantDataTests.Stages(0, 2);
            foreach (var stage in stages)
                stage.GetType().GetField("representation", BindingFlags.Instance | BindingFlags.NonPublic)
                    .SetValue(stage, new SpriteOrPrefab());
            typeof(PlantData).GetField("growthStages", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_data, stages);
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_root);
            Object.DestroyImmediate(_data);
        }

        [Test]
        public void WiltedStateRestoresTheFallbackTintOnLoad()
        {
            _view.Initialize("farm", Vector2Int.one, _data, 1, PlantCondition.Wilted);
            var renderer = _root.GetComponentInChildren<SpriteRenderer>(true);
            Assert.That(renderer.color, Is.EqualTo(new Color(0.55f, 0.45f, 0.3f, 1f)));
        }

        [Test]
        public void WiltNotificationsOnlyAffectTheirOwnCropAndBlockFurtherGrowthVisuals()
        {
            _view.Initialize("farm", Vector2Int.one, _data, 0);
            var renderer = _root.GetComponentInChildren<SpriteRenderer>(true);
            _view.OnEvent(new PlantConditionChangedEvent { PreviousCondition = PlantCondition.Healthy, Condition = PlantCondition.Wilted, LocationId = "village", Position = Vector2Int.one });
            _view.OnEvent(new PlantConditionChangedEvent { PreviousCondition = PlantCondition.Healthy, Condition = PlantCondition.Wilted, LocationId = "farm", Position = Vector2Int.zero });
            Assert.That(renderer.color, Is.EqualTo(Color.white));
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
            typeof(PlantData).GetField("wiltedRepresentation", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_data, new SpriteOrPrefab { type = SpriteOrPrefab.SpriteOrPrefabType.Prefab, prefab = prefab });
            _view.Initialize("farm", Vector2Int.one, _data, 0, PlantCondition.Wilted);
            Assert.That(_root.transform.childCount, Is.EqualTo(2));
            Assert.That(_root.transform.GetChild(1).GetComponent<SpriteRenderer>().color, Is.EqualTo(Color.red));
        }
    }
}
