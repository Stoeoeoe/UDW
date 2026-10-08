using System;
using System.Collections.Generic;
using System.Reflection;
using Items.Plants;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Plants.Editor
{
    [Category("FarmingTerrain")]
    public sealed class PlantDataTests
    {
        private PlantData _data;

        [SetUp]
        public void SetUp() => _data = ScriptableObject.CreateInstance<PlantData>();

        [TearDown]
        public void TearDown() => Object.DestroyImmediate(_data);

        [TestCase(0, 0)]
        [TestCase(1, 0)]
        [TestCase(2, 1)]
        [TestCase(4, 1)]
        [TestCase(5, 2)]
        [TestCase(100, 2)]
        public void GrowthUsesCumulativeDaysAndIncludesTheExactStageBoundary(int days, int expectedIndex)
        {
            var stages = Stages(0, 2, 5);
            SetStages(stages);
            Assert.That(_data.GetSeedStage(), Is.SameAs(stages[0]));
            Assert.That(_data.GetGrowthStageIndexByDays(days), Is.EqualTo(expectedIndex));
            Assert.That(_data.GetGrowthStageByDays(days), Is.SameAs(stages[expectedIndex]));
        }

        [Test]
        public void MissingOrEmptyStagesReturnNoStage()
        {
            AssertNoStage();
            SetStages(new List<GrowthStage>());
            AssertNoStage();
        }

        [Test]
        public void MissingOrNonzeroSeedStageInvalidatesTheGrowthSequence()
        {
            SetStages(new List<GrowthStage> { null, Stage(2) });
            AssertNoStage();
            SetStages(Stages(1, 2));
            AssertNoStage();
        }

        [Test]
        public void ASeedOnlyPlantRemainsAtItsSeedStage()
        {
            SetStages(Stages(0));
            Assert.That(_data.GetGrowthStageByDays(100), Is.SameAs(_data.GetSeedStage()));
        }

        [Test]
        public void GrowthStagesCannotBeChangedThroughThePublicView()
        {
            SetStages(Stages(0, 2));
            var view = (IList<GrowthStage>)_data.GrowthStages;
            Assert.Throws<NotSupportedException>(() => view.Add(Stage(5)));
            Assert.That(_data.GrowthStages.Count, Is.EqualTo(2));
        }

        [Test]
        public void NewCropDefinitionsDefaultToFiveDryDaysBeforeWilting()
        {
            Assert.That(_data.DaysWithoutWaterUntilWilt, Is.EqualTo(5));
        }

        private void AssertNoStage()
        {
            Assert.That(_data.GetSeedStage(), Is.Null);
            Assert.That(_data.GetGrowthStageIndexByDays(100), Is.EqualTo(-1));
            Assert.That(_data.GetGrowthStageByDays(100), Is.Null);
        }

        private void SetStages(List<GrowthStage> stages) => typeof(PlantData)
            .GetField("growthStages", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(_data, stages);

        internal static List<GrowthStage> Stages(params int[] days)
        {
            var result = new List<GrowthStage>();
            foreach (var day in days) result.Add(Stage(day));
            return result;
        }

        private static GrowthStage Stage(int day)
        {
            var stage = new GrowthStage();
            typeof(GrowthStage).GetField("daysToReachStage", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(stage, day);
            return stage;
        }
    }
}
