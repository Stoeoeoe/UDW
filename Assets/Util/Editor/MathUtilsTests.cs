using System;
using NUnit.Framework;

namespace Util.Editor
{
    public sealed class MathUtilsTests
    {
        private static readonly (string Name, float Weight)[] Items = { ("rare", 1), ("common", 3) };

        [TestCase(0.0, "rare")]
        [TestCase(0.24, "rare")]
        [TestCase(0.25, "common")]
        [TestCase(1.0, "common")] // UnityEngine.Random.value can return exactly 1.
        public void PicksByCumulativeWeight(double sample, string expected) =>
            Assert.That(MathUtils.PickWeighted(Items, item => item.Weight, sample).Name, Is.EqualTo(expected));

        [Test]
        public void RejectsNoItemsAndSamplesOutsideTheUnitRange()
        {
            Assert.Throws<ArgumentException>(() => MathUtils.PickWeighted(Array.Empty<(string, float)>(), item => item.Item2, 0.5));
            Assert.Throws<ArgumentOutOfRangeException>(() => MathUtils.PickWeighted(Items, item => item.Weight, -0.1));
            Assert.Throws<ArgumentOutOfRangeException>(() => MathUtils.PickWeighted(Items, item => item.Weight, 1.1));
        }
    }
}
