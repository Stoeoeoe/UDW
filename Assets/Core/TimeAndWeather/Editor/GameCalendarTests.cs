using Core.Game;
using Interaction;
using NUnit.Framework;

namespace Core.TimeAndWeather.Editor
{
    public sealed class GameCalendarTests
    {
        private readonly GameCalendar _calendar = new(6, 14,
            Season.Spring, Season.Summer, Season.Autumn, Season.Winter);

        [TestCase(6)]
        [TestCase(22)]
        public void PrayerBecomesAvailableNextMorningRegardlessOfPrayerHour(int prayerHour)
        {
            var time = new GameTimeState
            {
                daysSinceStart = 5, season = Season.Spring, dayOfSeason = 5, hour = prayerHour
            };
            var state = new InteractableState
            {
                availableAtMinute = _calendar.GetNextBoundaryMinute(time, GameTimeBoundary.NextDay)
            };

            Assert.That(state.IsCoolingDown(time.TotalMinutes), Is.True);
            time.daysSinceStart++;
            time.hour = 5;
            time.minute = 59;
            Assert.That(state.IsCoolingDown(time.TotalMinutes), Is.True);
            time.hour = 6;
            time.minute = 0;
            Assert.That(state.IsCoolingDown(time.TotalMinutes), Is.False);
        }

        [Test]
        public void SeasonAndYearBoundariesWorkWhenTheGameStartsMidSeason()
        {
            var time = new GameTimeState
            {
                daysSinceStart = 1, season = Season.Autumn, dayOfSeason = 5, hour = 18
            };
            Assert.That(_calendar.GetNextBoundaryMinute(time, GameTimeBoundary.NextSeason),
                Is.EqualTo(10L * 24 * 60 + 6 * 60));
            Assert.That(_calendar.GetNextBoundaryMinute(time, GameTimeBoundary.NextYear),
                Is.EqualTo(24L * 24 * 60 + 6 * 60));
        }

        [Test]
        public void NextYearOnItsFirstMorningStillMeansTheFollowingYear()
        {
            var time = new GameTimeState
            {
                daysSinceStart = 1, season = Season.Spring, dayOfSeason = 1, hour = 6
            };
            Assert.That(_calendar.GetNextBoundaryMinute(time, GameTimeBoundary.NextYear),
                Is.EqualTo(56L * 24 * 60 + 6 * 60));
        }

        [Test]
        public void SeasonRolloverFollowsTheConfiguredOrderAndWrapsToTheFirstSeason()
        {
            Assert.That(_calendar.GetNextSeason(Season.Spring), Is.EqualTo(Season.Summer));
            Assert.That(_calendar.GetNextSeason(Season.Summer), Is.EqualTo(Season.Autumn));
            Assert.That(_calendar.GetNextSeason(Season.Winter), Is.EqualTo(Season.Spring));
            var differentOrder = new GameCalendar(6, 14, Season.Autumn, Season.Winter, Season.Spring);
            Assert.That(differentOrder.GetNextSeason(Season.Spring), Is.EqualTo(Season.Autumn));
        }
    }
}
