using NUnit.Framework;

namespace Core.TimeAndWeather.Editor
{
    public sealed class CooldownTests
    {
        [Test]
        public void DeadlineUsesTheClockProvidedByTheCaller()
        {
            var cooldown = new Cooldown();
            cooldown.Start(10f, 5f);

            Assert.That(cooldown.IsActive(12f), Is.True);
            Assert.That(cooldown.Remaining(12f), Is.EqualTo(3f));
            Assert.That(cooldown.IsActive(15f), Is.False);
            Assert.That(cooldown.Remaining(15f), Is.Zero);
        }

        [Test]
        public void NegativeDurationAndResetAreInactive()
        {
            var cooldown = new Cooldown();
            cooldown.Start(10f, -5f);
            Assert.That(cooldown.IsActive(10f), Is.False);

            cooldown.Start(10f, 5f);
            cooldown.Reset();
            Assert.That(cooldown.IsActive(11f), Is.False);
            Assert.That(cooldown.Remaining(11f), Is.Zero);
        }
    }
}
