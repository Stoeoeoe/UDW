using Core.Context;
using NUnit.Framework;

namespace Core.TimeAndWeather.Editor
{
    public sealed class UrTimeSnapshotTests
    {
        [Test]
        public void EqualClockValuesDoNotChangeTheInteractionSnapshot()
        {
            var first = PlayerInteractionContextSnapshot.Empty() with
            {
                CurrentTime = new UrTime(Season.Spring, 5, 9, 20)
            };
            var second = PlayerInteractionContextSnapshot.Empty() with
            {
                CurrentTime = new UrTime(Season.Spring, 5, 9, 20)
            };

            Assert.That(first, Is.EqualTo(second));
            Assert.That(first.GetHashCode(), Is.EqualTo(second.GetHashCode()));
            Assert.That(second with { CurrentTime = new UrTime(Season.Spring, 5, 9, 30) },
                Is.Not.EqualTo(first));
        }
    }
}
