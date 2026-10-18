using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using Core.Common.Editor;
using Core.Events;
using Core.Game;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Rendering;

namespace Core.TimeAndWeather.Editor
{
    /// <summary>Checks seasonal weather selection, load refresh and presentation notifications against the real clock.</summary>
    public sealed class WeatherManagerTests : IEventListener<WeatherUpdateEvent>, IEventListener<DayLightUpdateEvent>, IEventListener<NewDayEvent>
    {
        private GameTestFixture _fixture;
        private UrTimeManager _clock;
        private WeatherManager _weather;
        private Volume _volume;
        private VolumeProfile _defaultProfile;
        private SeasonData _spring, _summer;
        private readonly List<WeatherData> _notifications = new();
        private Color _daylight;
        private WeatherData _dailyWeather;

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Weather tests");
            _fixture.Root.SetActive(true);
            _fixture.AddSingleton<GameStateManager>();
            var volumeObject = new GameObject("Weather volume");
            volumeObject.transform.SetParent(_fixture.Root.transform);
            _volume = volumeObject.AddComponent<Volume>();
            _defaultProfile = _fixture.Own(ScriptableObject.CreateInstance<VolumeProfile>());
            _weather = _fixture.AddSingleton<WeatherManager>(manager =>
            {
                Set(manager, "postProcessingVolume", _volume);
                Set(manager, "defaultVolumeProfile", _defaultProfile);
                manager.gameObject.SetActive(true);
            });
            _spring = CreateSeason(Core.TimeAndWeather.Season.Spring, Color.green);
            _summer = CreateSeason(Core.TimeAndWeather.Season.Summer, Color.yellow);
            _clock = _fixture.AddSingleton<UrTimeManager>(clock => Set(clock, "seasons", new[] { _spring, _summer }));
            _notifications.Clear();
            _dailyWeather = null;
            EventBus<WeatherUpdateEvent>.Subscribe(this);
            EventBus<DayLightUpdateEvent>.Subscribe(this);
            EventBus<NewDayEvent>.Subscribe(this);
        }

        [TearDown]
        public void TearDown()
        {
            EventBus<WeatherUpdateEvent>.Unsubscribe(this);
            EventBus<DayLightUpdateEvent>.Unsubscribe(this);
            EventBus<NewDayEvent>.Unsubscribe(this);
            _fixture.Dispose();
        }

        [Test]
        public void StartupChoosesSeasonalWeatherWithoutAdvancingDailySystems()
        {
            _clock.Start();
            Assert.That(_weather.CurrentWeather, Is.SameAs(_spring.weatherData.GetRandomItem()));
            Assert.That(_volume.profile, Is.SameAs(_defaultProfile));
            Assert.That(_daylight, Is.EqualTo(Color.green));
            Assert.That(_dailyWeather, Is.Null);
        }

        [Test]
        public void SeasonRolloverSelectsWeatherBeforePublishingTheNewDay()
        {
            _clock.Start();
            GameState.Time.dayOfSeason = 14;
            _clock.StartNewDay();
            Assert.That(_clock.CurrentSeason, Is.SameAs(_summer));
            Assert.That(GameState.Time.dayOfSeason, Is.EqualTo(1));
            Assert.That(_dailyWeather, Is.SameAs(_summer.weatherData.GetRandomItem()));
            Assert.That(_daylight, Is.EqualTo(Color.yellow));
        }

        [Test]
        public void ApplyingSavedTimeUsesTheRestoredSeasonWithoutStartingANewDay()
        {
            _clock.Start();
            GameState.Time.season = Core.TimeAndWeather.Season.Summer;
            GameState.Time.dayOfSeason = 7;
            GameState.Time.hour = 15;
            var minutes = GameState.Time.TotalMinutes;
            _clock.ApplySavedTime();
            Assert.That(_clock.CurrentSeason, Is.SameAs(_summer));
            Assert.That(_weather.CurrentWeather, Is.SameAs(_summer.weatherData.GetRandomItem()));
            Assert.That(GameState.Time.TotalMinutes, Is.EqualTo(minutes));
            Assert.That(_dailyWeather, Is.Null);
        }

        [Test]
        public void OnlyTheLatestWeatherPublishesAfterTheRendererWait()
        {
            _clock.Start();
            var first = Apply(_spring.weatherData.GetRandomItem());
            var latest = Apply(_summer.weatherData.GetRandomItem());
            Assert.That(first.MoveNext(), Is.True);
            Assert.That(latest.MoveNext(), Is.True);
            Assert.That(first.MoveNext(), Is.False);
            Assert.That(latest.MoveNext(), Is.False);
            Assert.That(_notifications, Is.EqualTo(new[] { _weather.CurrentWeather }));
        }

        [Test]
        public void WeatherOverridesPresentationAndPlainWeatherRestoresSeasonDefaults()
        {
            _clock.Start();
            var custom = _fixture.Own(ScriptableObject.CreateInstance<WeatherData>());
            custom.postProcessingProfile = _fixture.Own(ScriptableObject.CreateInstance<VolumeProfile>());
            custom.overrideDaylightColor = true;
            custom.daylightColorGradient = CreateGradient(Color.blue);
            CompleteWeather(custom);
            Assert.That(_volume.profile, Is.SameAs(custom.postProcessingProfile));
            Assert.That(_daylight, Is.EqualTo(Color.blue));
            CompleteWeather(_spring.weatherData.GetRandomItem());
            Assert.That(_volume.profile, Is.SameAs(_defaultProfile));
            Assert.That(_daylight, Is.EqualTo(Color.green));
        }

        public void OnEvent(WeatherUpdateEvent change) => _notifications.Add(change.WeatherData);
        public void OnEvent(DayLightUpdateEvent change) => _daylight = change.Color;
        public void OnEvent(NewDayEvent change) => _dailyWeather = _weather.CurrentWeather;

        private IEnumerator Apply(WeatherData weather) => (IEnumerator)typeof(WeatherManager)
            .GetMethod("ApplyWeather", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(_weather, new object[] { weather });

        private void CompleteWeather(WeatherData weather)
        {
            var routine = Apply(weather);
            Assert.That(routine.MoveNext(), Is.True);
            Assert.That(routine.MoveNext(), Is.False);
        }

        private SeasonData CreateSeason(Core.TimeAndWeather.Season season, Color color)
        {
            var data = _fixture.Own(ScriptableObject.CreateInstance<SeasonData>());
            data.season = season;
            data.daylightColorGradient = CreateGradient(color);
            data.weatherData = new Util.WeightedList<WeatherData>();
            data.weatherData.Add(_fixture.Own(ScriptableObject.CreateInstance<WeatherData>()));
            return data;
        }

        private static Gradient CreateGradient(Color color) => new()
        {
            colorKeys = new[] { new GradientColorKey(color, 0), new GradientColorKey(color, 1) }
        };

        private static void Set(object target, string field, object value) => target.GetType()
            .GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(target, value);
    }
}
