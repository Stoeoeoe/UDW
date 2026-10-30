using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using Core.Common.Editor;
using Core.Events;
using Core.Game;
using Core.Scripting;
using Core.Scripting.Editor;
using Core.Tile.Water;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Rendering;

namespace Core.TimeAndWeather.Editor
{
    /// <summary>Checks seasonal weather selection, load refresh and presentation notifications against the real clock.</summary>
    public sealed class WeatherManagerTests : IEventListener<WeatherUpdateEvent>, IEventListener<DayLightUpdateEvent>, IEventListener<NewDayEvent>, IEventListener<GameTimeChangedEvent>
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
        private float _previousWaterRain;
        private readonly List<long> _clockNotifications = new();

        [SetUp]
        public void SetUp()
        {
            _previousWaterRain = WaterInteraction.Rain;
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
            _spring.weatherData.GetRandomItem().waterRainIntensity = 0.35f;
            _summer = CreateSeason(Core.TimeAndWeather.Season.Summer, Color.yellow);
            _clock = _fixture.AddSingleton<UrTimeManager>(clock => Set(clock, "seasons", new[] { _spring, _summer }));
            _notifications.Clear();
            _dailyWeather = null;
            EventBus<WeatherUpdateEvent>.Subscribe(this);
            EventBus<DayLightUpdateEvent>.Subscribe(this);
            EventBus<NewDayEvent>.Subscribe(this);
            _clockNotifications.Clear();
            EventBus<GameTimeChangedEvent>.Subscribe(this);
        }

        [TearDown]
        public void TearDown()
        {
            EventBus<WeatherUpdateEvent>.Unsubscribe(this);
            EventBus<DayLightUpdateEvent>.Unsubscribe(this);
            EventBus<NewDayEvent>.Unsubscribe(this);
            EventBus<GameTimeChangedEvent>.Unsubscribe(this);
            _fixture.Dispose();
            WaterInteraction.Rain = _previousWaterRain;
        }

        [Test]
        public void StartupChoosesSeasonalWeatherWithoutAdvancingDailySystems()
        {
            _clock.Start();
            Assert.That(_weather.CurrentWeather, Is.SameAs(_spring.weatherData.GetRandomItem()));
            Assert.That(_volume.profile, Is.SameAs(_defaultProfile));
            Assert.That(_daylight, Is.EqualTo(Color.green));
            Assert.That(_dailyWeather, Is.Null);
            Assert.That(WaterInteraction.Rain, Is.EqualTo(0.35f));
        }

        [Test]
        public void LuaTimeQueriesAreDetachedReadOnlyAndReadTheCurrentSaveRoot()
        {
            var engine = new VulcanusLuaEngine();
            Assert.That(() => engine.EvaluateCondition("Time.GetCurrent().hour == 6"), Throws.Exception);
            _clock.Start();
            Assert.That(engine.EvaluateCondition("Time.GetCurrent().season == 'Spring' and Time.GetCurrent().dayOfSeason == 5"), Is.True);
            engine.Execute("local now = Time.GetCurrent(); now.hour = 22");
            Assert.That(GameState.Time.hour, Is.EqualTo(6));
            Assert.That(() => engine.EvaluateCondition("Time.SetTime(18, 30)"), Throws.Exception);
            var replacement = new GameSaveData();
            replacement.time.initialized = true;
            replacement.time.hour = 15;
            replacement.time.daysSinceStart = 3;
            replacement.time.season = Core.TimeAndWeather.Season.Spring;
            replacement.time.dayOfSeason = 7;
            typeof(GameStateManager).GetField("_data", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(GameStateManager.Instance, replacement);
            Assert.That(engine.EvaluateCondition("Time.GetCurrent().hour == 15 and Time.GetCurrent().totalMinutes == 3780"), Is.True);
        }

        [TestCase("setup")]
        [TestCase("sequence")]
        [TestCase("completion")]
        public void LuaTimeActionsAdvanceTheClockAndDailySystemsInEveryPhase(string phase)
        {
            _clock.Start();
            GameState.Time.hour = 20;
            GameState.Time.dayOfSeason = 14;
            GameState.Time.secondsTowardNextMinute = 3;
            var source = JArray.Parse("[{ 'id':'tomorrow', 'action':'time.startNewDay', 'arguments':{} }, { 'id':'evening', 'action':'time.setTime', 'arguments':{ 'hour':18, 'minute':30 } }]");
            var lua = CutsceneSequenceCompiler.Compile(source, "Time fixture", out var steps);
            var api = new TimeLuaApi();
            var bindings = CutsceneBindings.BindSequence(steps, "cutscene", (typeof(TimeLuaApi), () => api));
            using var session = VulcanusLuaEngine.StartSession(bindings, lua, "Time fixture", phase: phase);
            session.Tick(0);
            Assert.That(session.IsRunning, Is.False);
            Assert.That(GameState.Time.daysSinceStart, Is.EqualTo(2));
            Assert.That(GameState.Time.dayOfSeason, Is.EqualTo(1));
            Assert.That(GameState.Time.season, Is.EqualTo(Core.TimeAndWeather.Season.Summer));
            Assert.That(GameState.Time.hour, Is.EqualTo(18));
            Assert.That(GameState.Time.minute, Is.EqualTo(30));
            Assert.That(GameState.Time.secondsTowardNextMinute, Is.Zero);
            Assert.That(_dailyWeather, Is.SameAs(_summer.weatherData.GetRandomItem()));
            Assert.That(_clockNotifications, Is.EqualTo(new long[] { 1800, 2550 }));
            Assert.That(_daylight, Is.EqualTo(Color.yellow));
        }

        [TestCase(-1, 0)]
        [TestCase(24, 0)]
        [TestCase(18.5, 0)]
        [TestCase(18, 60)]
        [TestCase(18, -1)]
        [TestCase(18, 0.5)]
        [TestCase(double.NaN, 0)]
        [TestCase(18, double.PositiveInfinity)]
        [TestCase(5, 59)]
        [TestCase(23, 0)]
        public void LuaTimeRejectsInvalidClockInputsWithoutChangingState(double hour, double minute)
        {
            _clock.Start();
            var previous = GameState.Time.TotalMinutes;
            Assert.That(() => new TimeLuaApi().SetTime(hour, minute), Throws.TypeOf<System.ArgumentOutOfRangeException>());
            Assert.That(GameState.Time.TotalMinutes, Is.EqualTo(previous));
            Assert.That(_clockNotifications, Is.Empty);
        }

        [Test]
        public void LuaTimeRejectsUninitializedAndTransitioningClocksAndNeverRewinds()
        {
            var api = new TimeLuaApi();
            Assert.That(() => api.StartNewDay(), Throws.InvalidOperationException);
            _clock.Start();
            new VulcanusLuaEngine().Execute("Time.SetTime(18, 30)");
            Assert.That(() => api.SetTime(18, 29), Throws.InvalidOperationException);
            var previous = GameState.Time.TotalMinutes;
            Set(_clock, "_dayTransitionRoutine", new object[0].GetEnumerator());
            try
            {
                Assert.That(() => api.SetTime(19, 0), Throws.InvalidOperationException);
                Assert.That(() => api.StartNewDay(), Throws.InvalidOperationException);
            }
            finally { Set(_clock, "_dayTransitionRoutine", null); }
            api.SetTime(18, 30);
            Assert.That(GameState.Time.TotalMinutes, Is.EqualTo(previous));
            Assert.That(_clockNotifications, Has.Count.EqualTo(1));
        }

        [TestCase("setup")]
        [TestCase("sequence")]
        [TestCase("completion")]
        public void LuaWeatherActionSetsCatalogWeatherWithoutAdvancingTime(string phase)
        {
            _clock.Start();
            var selected = _summer.weatherData.GetRandomItem();
            selected.id = "test:dry";
            var catalog = _fixture.Own(ScriptableObject.CreateInstance<WeatherCatalog>());
            catalog.Synchronize(new[] { selected });
            var api = new WeatherLuaApi(_weather, catalog);
            var minutes = GameState.Time.TotalMinutes;
            using var session = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(api),
                "Weather.SetWeather('test:dry')", "Weather fixture", phase: phase);
            session.Tick(0);
            Assert.That(session.IsRunning, Is.False);
            Assert.That(_weather.CurrentWeather, Is.SameAs(selected));
            Assert.That(WaterInteraction.Rain, Is.Zero);
            Assert.That(GameState.Time.TotalMinutes, Is.EqualTo(minutes));
            _clock.StartNewDay();
            Assert.That(_weather.CurrentWeather, Is.SameAs(_spring.weatherData.GetRandomItem()),
                "The next normal daily roll replaces scripted weather.");
        }

        [Test]
        public void WeatherBindingRejectsUnknownDisabledAndInvalidDefinitionsBeforeExecution()
        {
            _clock.Start();
            var previous = _weather.CurrentWeather;
            var selected = _summer.weatherData.GetRandomItem();
            selected.id = "test:dry";
            var catalog = _fixture.Own(ScriptableObject.CreateInstance<WeatherCatalog>());
            catalog.Synchronize(new[] { selected });
            var api = new WeatherLuaApi(_weather, catalog);
            CutsceneSequenceCompiler.Compile(JArray.Parse(
                "[{ 'id':'weather', 'action':'weather.setWeather', 'arguments':{ 'weather':'test:dry' } }]"),
                "Weather fixture", out var steps);
            var factories = new[] { (typeof(WeatherLuaApi), (System.Func<object>)(() => api)) };
            CutsceneBindings.BindSequence(steps, "cutscene", factories);
            Assert.That(_weather.CurrentWeather, Is.SameAs(previous));
            Assert.That(() => api.ValidateWeather("unknown"), Throws.InvalidOperationException);
            catalog.SetEnabled(selected, false);
            Assert.That(() => CutsceneBindings.BindSequence(steps, "cutscene", factories),
                Throws.InvalidOperationException.With.Message.Contains("not registered and enabled"));
            catalog.SetEnabled(selected, true);
            selected.waterRainIntensity = float.NaN;
            Assert.That(() => CutsceneBindings.BindSequence(steps, "cutscene", factories),
                Throws.InvalidOperationException.With.Message.Contains("Rain splash intensity"));
            Assert.That(_weather.CurrentWeather, Is.SameAs(previous));
            Assert.That(() => new WeatherLuaApi(null, catalog), Throws.InvalidOperationException);
            Assert.That(() => new WeatherLuaApi(_weather, null), Throws.InvalidOperationException);
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
            Assert.That(WaterInteraction.Rain, Is.Zero);
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
            Assert.That(WaterInteraction.Rain, Is.Zero);
            Assert.That(_dailyWeather, Is.Null);
        }

        [Test]
        public void OnlyTheLatestWeatherPublishesAfterTheRendererWait()
        {
            _clock.Start();
            var first = Apply(_spring.weatherData.GetRandomItem());
            var latest = Apply(_summer.weatherData.GetRandomItem());
            Assert.That(first.MoveNext(), Is.True);
            Assert.That(WaterInteraction.Rain, Is.EqualTo(0.35f));
            Assert.That(latest.MoveNext(), Is.True);
            Assert.That(WaterInteraction.Rain, Is.Zero);
            Assert.That(first.MoveNext(), Is.False);
            Assert.That(WaterInteraction.Rain, Is.Zero, "An older rainy request must not undo the newer dry weather.");
            Assert.That(latest.MoveNext(), Is.False);
            Assert.That(_notifications, Is.EqualTo(new[] { _weather.CurrentWeather }));
        }

        [TestCase(-0.1f)]
        [TestCase(1.1f)]
        [TestCase(float.NaN)]
        [TestCase(float.PositiveInfinity)]
        public void InvalidRainIntensityFailsBeforeChangingWeather(float intensity)
        {
            _clock.Start();
            var previous = _weather.CurrentWeather;
            var invalid = _fixture.Own(ScriptableObject.CreateInstance<WeatherData>());
            invalid.waterRainIntensity = intensity;
            Assert.That(invalid.ValidateConfiguration()[0].Setting, Is.EqualTo(nameof(WeatherData.waterRainIntensity)));
            Assert.Throws<System.ArgumentException>(() => _weather.SetWeather(invalid));
            Assert.That(_weather.CurrentWeather, Is.SameAs(previous));
            Assert.That(WaterInteraction.Rain, Is.EqualTo(0.35f));
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
        public void OnEvent(GameTimeChangedEvent change) => _clockNotifications.Add(GameState.Time.TotalMinutes);

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
