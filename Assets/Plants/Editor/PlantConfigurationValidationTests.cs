using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Core.Common;
using Core.Common.Editor;
using Core.Inventory;
using Items.Plants;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace Plants.Editor
{
    [Category("FarmingTerrain")]
    public sealed class PlantConfigurationValidationTests
    {
        private PlantData _plant;
        private ProduceItem _produce;
        private GameObject _visual;

        [SetUp]
        public void SetUp()
        {
            _plant = ScriptableObject.CreateInstance<PlantData>();
            _plant.name = "Validation test crop";
            _produce = ScriptableObject.CreateInstance<ProduceItem>();
            Set(_produce, "_itemId", "test:produce");
            _visual = new GameObject("Test representation");
            Set(_plant, "_harvestItem", _produce);
            Set(_plant, "growthStages", new List<GrowthStage> { Stage(0), Stage(2), Stage(5, true) });
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_plant);
            Object.DestroyImmediate(_produce);
            Object.DestroyImmediate(_visual);
        }

        [TestCase(-1)]
        [TestCase(0)]
        [TestCase(1)]
        public void ValidConfigurationAllowsEmptySeasonsAndValidRegrowth(int regrowth)
        {
            Set(_plant, "growingSeasons", Array.Empty<Core.TimeAndWeather.Season>());
            Set(_plant, "_regrowthStageIndex", regrowth);
            Assert.That(_plant.ValidateConfiguration(), Is.Empty);
            Assert.That(_plant.TryGetHarvestStage(5, HarvestMethod.Picking, out _), Is.True);
            Assert.That(_plant.TryGetHarvestStage(5, HarvestMethod.Scythe, out _), Is.False);
            Assert.That(_plant.TryGetHarvestStage(2, HarvestMethod.Picking, out _), Is.False);
        }

        [Test]
        public void WiltedRepresentationIsOptionalButMustBeValidWhenSupplied()
        {
            Assert.That(_plant.ValidateConfiguration(), Is.Empty);
            Set(_plant, "_wiltedRepresentation", new SpriteOrPrefab
            {
                type = SpriteOrPrefab.SpriteOrPrefabType.Prefab
            });
            Assert.That(_plant.ValidateConfiguration().Any(e => e.Setting == "_wiltedRepresentation"), Is.True);
            Set(_plant, "_wiltedRepresentation", new SpriteOrPrefab
            {
                type = SpriteOrPrefab.SpriteOrPrefabType.Prefab, prefab = _visual
            });
            Assert.That(_plant.ValidateConfiguration(), Is.Empty);
        }

        [Test]
        public void UnitySerializationPreservesAnOmittedWiltedRepresentation()
        {
            var restored = ScriptableObject.CreateInstance<PlantData>();
            try
            {
                EditorJsonUtility.FromJsonOverwrite(EditorJsonUtility.ToJson(_plant), restored);
                Assert.That(restored.WiltedRepresentation, Is.Null);
                Assert.That(restored.ValidateConfiguration(), Is.Empty);
            }
            finally
            {
                Object.DestroyImmediate(restored);
            }
        }

        [Test]
        public void SuppliedWiltClearingFeedbackMustAutoplayAndOwnCleanup()
        {
            var feedback = _visual.AddComponent<MoreMountains.Feedbacks.MMF_Player>();
            Set(_plant, "_wiltedFeedbackPrefab", feedback);
            Assert.That(_plant.ValidateConfiguration().Any(e => e.Setting == "_wiltedFeedbackPrefab"), Is.True);
            feedback.AutoPlayOnStart = true;
            var cleanup = _visual.AddComponent<MoreMountains.Tools.MMTimedDestruction>();
            Assert.That(_plant.ValidateConfiguration(), Is.Empty);
            cleanup.TimeBeforeDestruction = 0;
            Assert.That(_plant.ValidateConfiguration().Any(e => e.Setting == "_wiltedFeedbackPrefab"), Is.True);
        }

        [Test]
        public void StandaloneValidatorAndGenericAssetHookReturnTheSameErrors()
        {
            Set(_plant, "_harvestItem", null);
            Set(_plant, "_daysWiltedUntilRemoval", 0);
            var direct = new PlantDataValidator().Validate(_plant);
            var throughAsset = _plant.ValidateConfiguration();
            Assert.That(direct.Select(error => error.ToString()),
                Is.EqualTo(throughAsset.Select(error => error.ToString())));
            Assert.That(direct.Count, Is.EqualTo(2));
        }

        [TestCase("growingSeasons", null)]
        [TestCase("_harvestItem", null)]
        [TestCase("_minHarvestQuantity", 0)]
        [TestCase("_maxHarvestQuantity", 0)]
        [TestCase("_maxHarvestQuantity", int.MaxValue)]
        [TestCase("_daysWithoutWaterUntilWilt", 0)]
        [TestCase("_daysWiltedUntilRemoval", -1)]
        [TestCase("_regrowthStageIndex", -2)]
        [TestCase("_regrowthStageIndex", 3)]
        [TestCase("_regrowthStageIndex", 2)]
        public void InvalidSettingReportsAssetAndFieldWithoutChangingTheValue(string field, object value)
        {
            Set(_plant, field, value);
            var error = _plant.ValidateConfiguration().FirstOrDefault(e => e.Setting == field);
            Assert.That(error, Is.Not.Null);
            Assert.That(error.Asset, Is.SameAs(_plant));
            Assert.That(error.ToString(), Does.Contain(_plant.name).And.Contain(field));
            Assert.That(Get(_plant, field), Is.EqualTo(value));
        }

        [TestCase("")]
        [TestCase("   ")]
        [TestCase(null)]
        public void MissingItemIdentityIsReported(string id)
        {
            Set(_produce, "_itemId", id);
            Assert.That(_plant.ValidateConfiguration().Any(e => e.Setting == "_harvestItem" && e.Message.Contains("ItemId")), Is.True);
        }

        [TestCase("null")]
        [TestCase("empty")]
        [TestCase("null-entry")]
        [TestCase("nonzero-seed")]
        [TestCase("duplicate-day")]
        [TestCase("unordered")]
        [TestCase("missing-reference")]
        public void InvalidStagesAreReportedIndependentlyOfGameplay(string fault)
        {
            var stages = new List<GrowthStage> { Stage(0), Stage(2), Stage(5, true) };
            switch (fault)
            {
                case "null": stages = null; break;
                case "empty": stages.Clear(); break;
                case "null-entry": stages[1] = null; break;
                case "nonzero-seed": stages[0] = Stage(1); break;
                case "duplicate-day": stages[1] = Stage(0); break;
                case "unordered": stages[2] = Stage(1, true); break;
                case "missing-reference": Set(stages[1], "_representation", new SpriteOrPrefab()); break;
            }
            Set(_plant, "growthStages", stages);
            Assert.That(_plant.ValidateConfiguration().Any(e => e.Setting.StartsWith("growthStages")), Is.True);
        }

        [Test]
        public void RegrowthMustPrecedeEveryHarvestStage()
        {
            Set(_plant, "growthStages", new List<GrowthStage> { Stage(0), Stage(2, true), Stage(5), Stage(7, true) });
            Set(_plant, "_regrowthStageIndex", 2);
            Assert.That(_plant.ValidateConfiguration().Any(e => e.Setting == "_regrowthStageIndex"), Is.True);
        }

        [Test]
        public void RegrowthCannotSelectANullStage()
        {
            Set(_plant, "growthStages", new List<GrowthStage> { Stage(0), null, Stage(5, true) });
            Set(_plant, "_regrowthStageIndex", 1);
            Assert.That(_plant.ValidateConfiguration().Any(e => e.Setting == "_regrowthStageIndex"), Is.True);
        }

        [Test]
        public void OnValidateReportsTheSameRulesAndDoesNotClampValues()
        {
            Set(_plant, "_daysWiltedUntilRemoval", 0);
            var error = _plant.ValidateConfiguration().Single();
            LogAssert.Expect(LogType.Error, error.ToString());
            typeof(ValidatedScriptableObject).GetMethod("OnValidate", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(_plant, null);
            Assert.That(_plant.DaysWiltedUntilRemoval, Is.Zero);
        }

        [Test]
        public void ProjectScanFindsUnreferencedAssetsAndSubAssetsAndBuildHookRejectsThem()
        {
            var folder = "Assets/__ConfigurationValidation_" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", folder.Substring("Assets/".Length));
            var path = folder + "/Unreferenced.asset";
            PlantData subAsset = null;
            var previousIgnore = LogAssert.ignoreFailingMessages;
            try
            {
                // Import-time OnValidate also reports these intentional invalid test assets.
                LogAssert.ignoreFailingMessages = true;
                Set(_plant, "_harvestItem", null);
                AssetDatabase.CreateAsset(_plant, path);
                subAsset = Object.Instantiate(_plant);
                subAsset.name = "Invalid sub-asset";
                AssetDatabase.AddObjectToAsset(subAsset, _plant);
                var errors = ValidatedAssetValidation.ValidateProject();
                Assert.That(errors.Any(e => e.Asset == _plant && e.Setting == "_harvestItem"), Is.True);
                Assert.That(errors.Any(e => e.Asset == subAsset && e.Setting == "_harvestItem"), Is.True);
                var failure = Assert.Throws<BuildFailedException>(() =>
                    new ValidatedAssetValidation().OnPreprocessBuild(null));
                Assert.That(failure.Message, Does.Contain(path).And.Contain("_harvestItem"));
            }
            finally
            {
                AssetDatabase.DeleteAsset(folder);
                if (subAsset) Object.DestroyImmediate(subAsset);
                LogAssert.ignoreFailingMessages = previousIgnore;
            }
        }

        private GrowthStage Stage(int day, bool harvestable = false)
        {
            var stage = new GrowthStage();
            Set(stage, "_daysToReachStage", day);
            Set(stage, "_isHarvestable", harvestable);
            Set(stage, "_representation", new SpriteOrPrefab { type = SpriteOrPrefab.SpriteOrPrefabType.Prefab, prefab = _visual });
            return stage;
        }

        private static void Set(object target, string field, object value) => Field(target, field).SetValue(target, value);
        private static object Get(object target, string field) => Field(target, field).GetValue(target);
        private static FieldInfo Field(object target, string field)
        {
            for (var type = target.GetType(); type != null; type = type.BaseType)
            {
                var found = type.GetField(field, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public)
                    ?? type.GetField($"<{field}>k__BackingField", BindingFlags.Instance | BindingFlags.NonPublic);
                if (found != null) return found;
            }
            throw new ArgumentException(field);
        }
    }
}
