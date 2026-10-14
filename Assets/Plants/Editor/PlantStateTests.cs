using NUnit.Framework;
using System.Reflection;
using Core.TimeAndWeather;
using UnityEngine;

namespace Plants.Editor
{
    [Category("FarmingTerrain")]
    public sealed class PlantStateTests
    {
        private PlantData _definition;

        [SetUp]
        public void SetUp() => _definition = ScriptableObject.CreateInstance<PlantData>();

        [TearDown]
        public void TearDown() => Object.DestroyImmediate(_definition);

        [Test]
        public void NewPlantsStartHealthy()
        {
            Assert.That(new PlantState("test:crop").condition, Is.EqualTo(PlantCondition.Healthy));
        }

        [Test]
        public void WateredDayGrowsAndResetsDryDays()
        {
            var state = new PlantState("test:crop") { consecutiveDaysWithoutWater = 4 };
            state.AdvanceDay(_definition, Season.Spring, wasWatered: true);
            Assert.That(state.daysPassedSincePlanting, Is.EqualTo(1));
            Assert.That(state.consecutiveDaysWithoutWater, Is.Zero);
            Assert.That(state.condition, Is.EqualTo(PlantCondition.Healthy));
        }

        [TestCase(1)]
        [TestCase(3)]
        [TestCase(5)]
        public void DryDaysNeverGrowAndWiltExactlyOnTheThreshold(int threshold)
        {
            var state = new PlantState("test:crop") { daysPassedSincePlanting = 2 };
            typeof(PlantData).GetField("_daysWithoutWaterUntilWilt", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_definition, threshold);
            for (var day = 1; day <= threshold; day++)
            {
                state.AdvanceDay(_definition, Season.Spring, wasWatered: false);
                Assert.That(state.consecutiveDaysWithoutWater, Is.EqualTo(day));
                Assert.That(state.daysPassedSincePlanting, Is.EqualTo(2));
                Assert.That(state.condition, Is.EqualTo(day == threshold ? PlantCondition.Wilted : PlantCondition.Healthy));
            }
        }

        [Test]
        public void DryDaysMustBeConsecutiveToWilt()
        {
            var state = new PlantState("test:crop");
            for (var cycle = 0; cycle < 3; cycle++)
            {
                for (var day = 0; day < 4; day++) state.AdvanceDay(_definition, Season.Spring, wasWatered: false);
                state.AdvanceDay(_definition, Season.Spring, wasWatered: true);
                Assert.That(state.condition, Is.EqualTo(PlantCondition.Healthy));
            }
            Assert.That(state.daysPassedSincePlanting, Is.EqualTo(3));
        }

        [TestCase(true)]
        [TestCase(false)]
        public void WiltedPlantsDoNotRecoverOrAdvance(bool irrigated)
        {
            var state = new PlantState("test:crop")
            {
                daysPassedSincePlanting = 2, consecutiveDaysWithoutWater = 5, condition = PlantCondition.Wilted
            };
            state.AdvanceDay(_definition, Season.Spring, wasWatered: irrigated);
            Assert.That(state.condition, Is.EqualTo(PlantCondition.Wilted));
            Assert.That(state.daysPassedSincePlanting, Is.EqualTo(2));
            Assert.That(state.consecutiveDaysWithoutWater, Is.EqualTo(5));
            Assert.That(state.daysSinceWilted, Is.EqualTo(1));
        }
    }
}
