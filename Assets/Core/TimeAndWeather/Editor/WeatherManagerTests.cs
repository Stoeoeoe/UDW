using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using Core.Common.Editor;
using Core.Events;
using Core.Game;
using Core.Location;
using Core.Scripting;
using Core.Scripting.Editor;
using Core.Tile.Water;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using MoreMountains.Tools;
using UnityEngine;
using UnityEngine.Rendering;

namespace Core.TimeAndWeather.Editor
{
    /// <summary>Checks seasonal weather selection, load refresh and presentation notifications against the real clock.</summary>
    public sealed class WeatherManagerTests : Core.Common.Editor.GameTest, IEventListener<WeatherUpdateEvent>, IEventListener<DayLightUpdateEvent>, IEventListener<NewDayEvent>, IEventListener<GameTimeChangedEvent>
    {

        private UrTimeManager _clock;
        private WeatherManager _weather;
        private Volume _volume;
        private VolumeProfile _defaultProfile;
        private SeasonData _spring, _summer;
        private readonly List<WeatherData> _notifications = new();
        private Color _daylight;
        private WeatherData _dailyWeather;
        private float _previousWaterRain;
        private float _previousIndoorCover;
        private WeatherSoundManagerProbe _sound;
        private readonly List<long> _clockNotifications = new();

        [SetUp]
        public void SetUp()
        {
            _previousWaterRain = WaterInteraction.Rain;
            _previousIndoorCover = Shader.GetGlobalFloat("_IndoorWeatherCover");

            Game.Root.SetActive(true);

            _sound = Game.RegisterManager<WeatherSoundManagerProbe>();
            var volumeObject = new GameObject("Weather volume");
            volumeObject.transform.SetParent(Game.Root.transform);
            _volume = volumeObject.AddComponent<Volume>();
            _defaultProfile = Game.Asset<VolumeProfile>();
            _weather = Game.Start<WeatherManager>(manager =>
            {
                Set(manager, "postProcessingVolume", _volume);
                Set(manager, "defaultVolumeProfile", _defaultProfile);
                manager.gameObject.SetActive(true);
            });
            _spring = CreateSeason(Core.TimeAndWeather.Season.Spring, Color.green);
            _spring.weatherData.GetRandomItem().waterRainIntensity = 0.35f;
            _summer = CreateSeason(Core.TimeAndWeather.Season.Summer, Color.yellow);
            _clock = Game.Start<UrTimeManager>(clock => Set(clock, "seasons", new[] { _spring, _summer }));
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

            WaterInteraction.Rain = _previousWaterRain;
            Shader.SetGlobalFloat("_IndoorWeatherCover", _previousIndoorCover);
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
            var engine = Game.Lua.CreateEngine();
            Assert.That(() => engine.EvaluateCondition("Time.GetCurrent().hour == 6"), Throws.Exception);
            _clock.Start();
            Assert.That(engine.EvaluateCondition("Time.GetCurrent().season == 'Spring' and Time.GetCurrent().dayOfSeason == 5"), Is.True);
            engine.Execute("local now = Time.GetCurrent(); now.hour = 22");
            Assert.That(Game.State.Time.hour, Is.EqualTo(6));
            Assert.That(() => engine.EvaluateCondition("Time.SetTime(18, 30)"), Throws.Exception);
            var replacement = new GameSaveData();
            replacement.time.initialized = true;
            replacement.time.hour = 15;
            replacement.time.daysSinceStart = 3;
            replacement.time.season = Core.TimeAndWeather.Season.Spring;
            replacement.time.dayOfSeason = 7;
            typeof(GameState).GetMethod("Restore", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(Game.State, new object[] { replacement });
            Assert.That(engine.EvaluateCondition("Time.GetCurrent().hour == 15 and Time.GetCurrent().totalMinutes == 3780"), Is.True);
        }

        [TestCase("setup")]
        [TestCase("sequence")]
        [TestCase("completion")]
        public void LuaTimeActionsAdvanceTheClockAndDailySystemsInEveryPhase(string phase)
        {
            _clock.Start();
            Game.State.Time.hour = 20;
            Game.State.Time.dayOfSeason = 14;
            Game.State.Time.secondsTowardNextMinute = 3;
            var source = JArray.Parse("[{ 'id':'tomorrow', 'action':'time.startNewDay', 'arguments':{} }, { 'id':'evening', 'action':'time.setTime', 'arguments':{ 'hour':18, 'minute':30 } }]");
            var lua = CutsceneSequenceCompiler.Compile(source, "Time fixture", out var steps);
            var api = Game.Inject(new TimeLuaApi());
            var bindings = Game.BindSequence(steps, "cutscene", (typeof(TimeLuaApi), () => api));
            using var session = VulcanusLuaEngine.StartSession(bindings, lua, "Time fixture", phase: phase);
            session.Tick(0);
            Assert.That(session.IsRunning, Is.False);
            Assert.That(Game.State.Time.daysSinceStart, Is.EqualTo(2));
            Assert.That(Game.State.Time.dayOfSeason, Is.EqualTo(1));
            Assert.That(Game.State.Time.season, Is.EqualTo(Core.TimeAndWeather.Season.Summer));
            Assert.That(Game.State.Time.hour, Is.EqualTo(18));
            Assert.That(Game.State.Time.minute, Is.EqualTo(30));
            Assert.That(Game.State.Time.secondsTowardNextMinute, Is.Zero);
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
            var previous = Game.State.Time.TotalMinutes;
            var api = Game.Inject(new TimeLuaApi());
            Assert.That(() => api.SetTime(hour, minute), Throws.TypeOf<System.ArgumentOutOfRangeException>());
            Assert.That(Game.State.Time.TotalMinutes, Is.EqualTo(previous));
            Assert.That(_clockNotifications, Is.Empty);
        }

        [Test]
        public void LuaTimeRejectsUninitializedAndTransitioningClocksAndNeverRewinds()
        {
            var api = Game.Inject(new TimeLuaApi());
            Assert.That(() => api.StartNewDay(), Throws.InvalidOperationException);
            _clock.Start();
            Game.Lua.CreateEngine().Execute("Time.SetTime(18, 30)");
            Assert.That(() => api.SetTime(18, 29), Throws.InvalidOperationException);
            var previous = Game.State.Time.TotalMinutes;
            Set(_clock, "_dayTransitionRoutine", new object[0].GetEnumerator());
            try
            {
                Assert.That(() => api.SetTime(19, 0), Throws.InvalidOperationException);
                Assert.That(() => api.StartNewDay(), Throws.InvalidOperationException);
            }
            finally { Set(_clock, "_dayTransitionRoutine", null); }
            api.SetTime(18, 30);
            Assert.That(Game.State.Time.TotalMinutes, Is.EqualTo(previous));
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
            var catalog = Game.Asset<WeatherCatalog>();
            catalog.Synchronize(new[] { selected });
            var api = new WeatherLuaApi(_weather, catalog);
            var minutes = Game.State.Time.TotalMinutes;
            using var session = VulcanusLuaEngine.StartSession(Game.Bind(api),
                "Weather.SetWeather('test:dry')", "Weather fixture", phase: phase);
            session.Tick(0);
            Assert.That(session.IsRunning, Is.False);
            Assert.That(_weather.CurrentWeather, Is.SameAs(selected));
            Assert.That(WaterInteraction.Rain, Is.Zero);
            Assert.That(Game.State.Time.TotalMinutes, Is.EqualTo(minutes));
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
            var catalog = Game.Asset<WeatherCatalog>();
            catalog.Synchronize(new[] { selected });
            var api = new WeatherLuaApi(_weather, catalog);
            CutsceneSequenceCompiler.Compile(JArray.Parse(
                "[{ 'id':'weather', 'action':'weather.setWeather', 'arguments':{ 'weather':'test:dry' } }]"),
                "Weather fixture", out var steps);
            var factories = new[] { (typeof(WeatherLuaApi), (System.Func<object>)(() => api)) };
            Game.BindSequence(steps, "cutscene", factories);
            Assert.That(_weather.CurrentWeather, Is.SameAs(previous));
            Assert.That(() => api.ValidateWeather("unknown"), Throws.InvalidOperationException);
            catalog.SetEnabled(selected, false);
            Assert.That(() => Game.BindSequence(steps, "cutscene", factories),
                Throws.InvalidOperationException.With.Message.Contains("not registered and enabled"));
            catalog.SetEnabled(selected, true);
            selected.waterRainIntensity = float.NaN;
            Assert.That(() => Game.BindSequence(steps, "cutscene", factories),
                Throws.InvalidOperationException.With.Message.Contains("Rain splash intensity"));
            Assert.That(_weather.CurrentWeather, Is.SameAs(previous));
            Assert.That(() => new WeatherLuaApi(null, catalog), Throws.InvalidOperationException);
            Assert.That(() => new WeatherLuaApi(_weather, null), Throws.InvalidOperationException);
        }

        [Test]
        public void SeasonRolloverSelectsWeatherBeforePublishingTheNewDay()
        {
            _clock.Start();
            Game.State.Time.dayOfSeason = 14;
            _clock.StartNewDay();
            Assert.That(_clock.CurrentSeason, Is.SameAs(_summer));
            Assert.That(Game.State.Time.dayOfSeason, Is.EqualTo(1));
            Assert.That(_dailyWeather, Is.SameAs(_summer.weatherData.GetRandomItem()));
            Assert.That(_daylight, Is.EqualTo(Color.yellow));
            Assert.That(WaterInteraction.Rain, Is.Zero);
        }

        [Test]
        public void ApplyingSavedTimeUsesTheRestoredSeasonWithoutStartingANewDay()
        {
            _clock.Start();
            Game.State.Time.season = Core.TimeAndWeather.Season.Summer;
            Game.State.Time.dayOfSeason = 7;
            Game.State.Time.hour = 15;
            var minutes = Game.State.Time.TotalMinutes;
            _clock.ApplySavedTime();
            Assert.That(_clock.CurrentSeason, Is.SameAs(_summer));
            Assert.That(_weather.CurrentWeather, Is.SameAs(_summer.weatherData.GetRandomItem()));
            Assert.That(Game.State.Time.TotalMinutes, Is.EqualTo(minutes));
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
            var invalid = Game.Asset<WeatherData>();
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
            var custom = Game.Asset<WeatherData>();
            custom.postProcessingProfile = Game.Asset<VolumeProfile>();
            custom.overrideDaylightColor = true;
            custom.daylightColorGradient = CreateGradient(Color.blue);
            CompleteWeather(custom);
            Assert.That(_volume.profile, Is.SameAs(custom.postProcessingProfile));
            Assert.That(_daylight, Is.EqualTo(Color.blue));
            CompleteWeather(_spring.weatherData.GetRandomItem());
            Assert.That(_volume.profile, Is.SameAs(_defaultProfile));
            Assert.That(_daylight, Is.EqualTo(Color.green));
        }

        [Test]
        public void RoomsUseIndoorLightRampAndSuppressWeatherUntilReturningOutside()
        {
            _clock.Start();
            var rainy = _weather.CurrentWeather;
            rainy.indoorDaylightColorGradient = new Gradient
            {
                colorKeys = new[] { new GradientColorKey(Color.gray, 0), new GradientColorKey(Color.blue, 1) }
            };
            var room = Location(Core.Common.LocationType.Indoor);
            _weather.OnLocationEnter(room);
            Assert.That(_weather.CurrentWeather, Is.SameAs(rainy));
            Assert.That(WaterInteraction.Rain, Is.Zero);
            Assert.That(Shader.GetGlobalFloat("_IndoorWeatherCover"), Is.EqualTo(1));
            Assert.That(_daylight, Is.EqualTo(rainy.indoorDaylightColorGradient.Evaluate(_clock.DayProgress)));
            _clock.SetTimeOfDay(18, 0);
            Assert.That(_daylight, Is.EqualTo(rainy.indoorDaylightColorGradient.Evaluate(_clock.DayProgress)));
            CompleteWeather(_summer.weatherData.GetRandomItem());
            Assert.That(Shader.GetGlobalFloat("_IndoorWeatherCover"), Is.EqualTo(1));
            Assert.That(_daylight, Is.EqualTo(Color.white));
            CompleteWeather(rainy);
            Assert.That(WaterInteraction.Rain, Is.Zero, "Changing weather in a room must not enable rain splashes.");
            _weather.OnLocationEnter(Location(Core.Common.LocationType.Outdoor));
            Assert.That(Shader.GetGlobalFloat("_IndoorWeatherCover"), Is.Zero);
            Assert.That(WaterInteraction.Rain, Is.EqualTo(0.35f));
            Assert.That(_daylight, Is.EqualTo(Color.green));
        }

        [Test]
        public void WeatherAmbienceSwapsForRoomsCanBeMutedAndReleasesItsLoopOnDisable()
        {
            _clock.Start();
            var rainy = _weather.CurrentWeather;
            rainy.outdoorAmbience = Game.Own(AudioClip.Create("Outdoor rain", 100, 1, 44100, false));
            rainy.indoorAmbience = Game.Own(AudioClip.Create("Muffled rain", 100, 1, 44100, false));
            var outdoors = Location(Core.Common.LocationType.Outdoor);
            var room = Location(Core.Common.LocationType.Indoor);
            _weather.OnLocationEnter(outdoors);
            Assert.That(_sound.LastSource.clip, Is.SameAs(rainy.outdoorAmbience));
            Assert.That(_sound.Options.Loop && _sound.Options.Persistent, Is.True);
            Assert.That(_sound.Options.SpatialBlend, Is.Zero);
            _weather.OnLocationEnter(outdoors);
            Assert.That(_sound.Plays, Is.EqualTo(1), "Moving between outdoor maps keeps the same ambience running.");
            _weather.OnLocationEnter(room);
            Assert.That(_sound.LastSource.clip, Is.SameAs(rainy.indoorAmbience));
            Assert.That(_sound.Frees, Is.EqualTo(1));
            room.muteWeatherAudio = true;
            _weather.OnLocationEnter(room);
            Assert.That(_sound.Frees, Is.EqualTo(2));
            CompleteWeather(rainy);
            Assert.That(_sound.Plays, Is.EqualTo(2), "Weather changes must respect a silent location.");
            outdoors.muteWeatherAudio = true;
            _weather.OnLocationEnter(outdoors);
            Assert.That(_sound.Plays, Is.EqualTo(2), "The opt-out also applies outdoors.");
            outdoors.muteWeatherAudio = false;
            _weather.OnLocationEnter(outdoors);
            Assert.That(_sound.LastSource.clip, Is.SameAs(rainy.outdoorAmbience));
            GameTestFixture.Invoke(_weather, "OnDisable");
            Assert.That(_sound.Frees, Is.EqualTo(3));
            Assert.That(Shader.GetGlobalFloat("_IndoorWeatherCover"), Is.Zero);
        }

        [Test]
        public void MissingIndoorClipMeansSilenceAndDoesNotReuseOutdoorRain()
        {
            _clock.Start();
            _weather.CurrentWeather.outdoorAmbience = Game.Own(AudioClip.Create("Rain", 100, 1, 44100, false));
            _weather.OnLocationEnter(Location(Core.Common.LocationType.Outdoor));
            _weather.OnLocationEnter(Location(Core.Common.LocationType.Indoor));
            Assert.That(_sound.Plays, Is.EqualTo(1));
            Assert.That(_sound.Frees, Is.EqualTo(1));
        }

        [Test]
        public void SharedRainLoopIsMuffledIndoorsAndRestoredOutsideWithoutRestarting()
        {
            _clock.Start();
            var rainy = _weather.CurrentWeather;
            rainy.outdoorAmbience = rainy.indoorAmbience = Game.Own(AudioClip.Create("Rain", 44100, 1, 44100, false));
            rainy.ambienceVolume = 0.8f;
            rainy.indoorAmbienceVolumeMultiplier = 0.6f;
            rainy.indoorAmbienceLowPass = true;
            rainy.indoorAmbienceCutoffFrequency = 1500;
            _weather.OnLocationEnter(Location(Core.Common.LocationType.Outdoor));
            var source = _sound.LastSource;
            _weather.OnLocationEnter(Location(Core.Common.LocationType.Indoor));
            var filter = source.GetComponent<AudioLowPassFilter>();
            Assert.That(filter.enabled, Is.True);
            Assert.That(filter.cutoffFrequency, Is.EqualTo(1500).Within(0.01f));
            Assert.That(source.volume, Is.EqualTo(0.48f).Within(0.001f));
            Assert.That(_sound.Plays, Is.EqualTo(1));
            Assert.That(_sound.Frees, Is.Zero);
            _weather.OnLocationEnter(Location(Core.Common.LocationType.Outdoor));
            Assert.That(filter.enabled, Is.False);
            Assert.That(source.volume, Is.EqualTo(0.8f));
            Assert.That(_sound.Plays, Is.EqualTo(1));
            _weather.OnLocationEnter(Location(Core.Common.LocationType.Indoor));
            var dry = _summer.weatherData.GetRandomItem();
            dry.indoorAmbience = rainy.indoorAmbience;
            CompleteWeather(dry);
            Assert.That(filter.enabled, Is.False, "New weather settings apply even when the clip stays the same.");
            Assert.That(source.volume, Is.EqualTo(1f));
            CompleteWeather(rainy);
            Assert.That(filter.enabled, Is.True);
            var room = Location(Core.Common.LocationType.Indoor);
            room.muteWeatherAudio = true;
            _weather.OnLocationEnter(room);
            Assert.That(_sound.Frees, Is.EqualTo(1));
            Assert.That(filter.enabled, Is.False, "Returning a source to the shared pool must clear weather filtering.");
        }

        [TestCase(float.NaN, 1500)]
        [TestCase(-0.1f, 1500)]
        [TestCase(1.1f, 1500)]
        [TestCase(0.6f, float.PositiveInfinity)]
        [TestCase(0.6f, 0)]
        [TestCase(0.6f, 22001)]
        public void InvalidIndoorAudioSettingsFailBeforeChangingWeather(float volume, float cutoff)
        {
            _clock.Start();
            var previous = _weather.CurrentWeather;
            var invalid = Game.Asset<WeatherData>();
            invalid.indoorAmbienceVolumeMultiplier = volume;
            invalid.indoorAmbienceCutoffFrequency = cutoff;
            Assert.Throws<System.ArgumentException>(() => _weather.SetWeather(invalid));
            Assert.That(_weather.CurrentWeather, Is.SameAs(previous));
        }

        private LocationData Location(Core.Common.LocationType type)
        {
            var location = Game.Asset<LocationData>();
            location.id = type == Core.Common.LocationType.Indoor ? "test:room" : "test:outside";
            location.locationType = type;
            return location;
        }

        public void OnEvent(WeatherUpdateEvent change) => _notifications.Add(change.WeatherData);
        public void OnEvent(DayLightUpdateEvent change) => _daylight = change.Color;
        public void OnEvent(NewDayEvent change) => _dailyWeather = _weather.CurrentWeather;
        public void OnEvent(GameTimeChangedEvent change) => _clockNotifications.Add(Game.State.Time.TotalMinutes);

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
            var data = Game.Asset<SeasonData>();
            data.season = season;
            data.daylightColorGradient = CreateGradient(color);
            data.weatherData = new Util.WeightedList<WeatherData>();
            data.weatherData.Add(Game.Asset<WeatherData>());
            return data;
        }

        private static Gradient CreateGradient(Color color) => new()
        {
            colorKeys = new[] { new GradientColorKey(color, 0), new GradientColorKey(color, 1) }
        };

        private static void Set(object target, string field, object value) => target.GetType()
            .GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(target, value);
    }

    public sealed class WeatherSoundManagerProbe : MMSoundManager
    {
        public int Plays, Frees;
        public AudioSource LastSource;
        public MMSoundManagerPlayOptions Options;
        protected override void Awake() { }
        public override AudioSource PlaySound(AudioClip clip, MMSoundManagerPlayOptions options)
        {
            Plays++;
            Options = options;
            LastSource = gameObject.AddComponent<AudioSource>();
            LastSource.clip = clip;
            return LastSource;
        }
        public override void FreeSound(AudioSource source)
        {
            Frees++;
            source.Stop();
            source.clip = null;
        }
    }
}
