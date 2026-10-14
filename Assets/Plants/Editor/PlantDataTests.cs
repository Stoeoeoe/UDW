using System;
using System.Collections.Generic;
using System.Reflection;
using Core.TimeAndWeather;
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

        [TestCase(Season.Spring)]
        [TestCase(Season.Summer)]
        [TestCase(Season.Autumn)]
        [TestCase(Season.Winter)]
        public void DefaultCropDefinitionsGrowInEverySeason(Season season)
        {
            Assert.That(_data.CanGrowInSeason(season), Is.True);
        }

        [Test]
        public void AllowedSeasonsAreExplicitAndAnEmptySelectionNeverGrows()
        {
            var field = typeof(PlantData).GetField("growingSeasons", BindingFlags.Instance | BindingFlags.NonPublic);
            field.SetValue(_data, new[] { Season.Spring, Season.Autumn });
            Assert.That(_data.CanGrowInSeason(Season.Spring), Is.True);
            Assert.That(_data.CanGrowInSeason(Season.Autumn), Is.True);
            Assert.That(_data.CanGrowInSeason(Season.Winter), Is.False);
            field.SetValue(_data, Array.Empty<Season>());
            Assert.That(_data.CanGrowInSeason(Season.Spring), Is.False);
        }

        [TestCase(1)]
        [TestCase(3)]
        [TestCase(int.MaxValue - 1)]
        public void EqualHarvestBoundsAlwaysProduceThatQuantity(int quantity)
        {
            SetQuantityRange(quantity, quantity);
            Assert.That(_data.RollHarvestQuantity(), Is.EqualTo(quantity));
        }

        [Test]
        public void HarvestQuantityRollIncludesBothEndpointsAndStaysWithinBounds()
        {
            SetQuantityRange(2, 5);
            var previousRandomState = UnityEngine.Random.state;
            try
            {
                UnityEngine.Random.InitState(123);
                var quantities = new HashSet<int>();
                for (var i = 0; i < 128; i++)
                {
                    var quantity = _data.RollHarvestQuantity();
                    Assert.That(quantity, Is.InRange(2, 5));
                    quantities.Add(quantity);
                }
                Assert.That(quantities, Does.Contain(2));
                Assert.That(quantities, Does.Contain(5));
            }
            finally { UnityEngine.Random.state = previousRandomState; }
        }

        private void SetQuantityRange(int min, int max)
        {
            typeof(PlantData).GetField("_minHarvestQuantity", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(_data, min);
            typeof(PlantData).GetField("_maxHarvestQuantity", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(_data, max);
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
            typeof(GrowthStage).GetField("_daysToReachStage", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(stage, day);
            return stage;
        }
    }
}
