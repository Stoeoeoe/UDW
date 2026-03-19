using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Core.TimeAndWeather.Seasons;
using Core.TimeAndWeather.Weather;
using MoreMountains.Feedbacks;
using MoreMountains.Tools;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

// TODO: Probably the whole weather management can be simplified. It appears that a lot of the problems stemmed from being run too early (before renderer is ready).

namespace Core.TimeAndWeather
{
    public class UrTimeManager : MMTimeManager
    {
        [Header("Time Settings")] [SerializeField]
        protected Season startingSeason = Season.Spring;

        [SerializeField] protected int startingDay = 5;
        [SerializeField] protected int startOfDay = 6;
        [SerializeField] protected int endOfDay = 23;
        [SerializeField] protected int numberOfDaysInSeason = 14;
        [SerializeField] protected float secondsPerInGameMinute = 10f; // TODO: Probably wrong? Seems too fast

        [Header("Current Time")] [MMReadOnly] [SerializeField]
        protected float currentTotalTicks = 0f;

        [MMReadOnly] [SerializeField] protected int currentDaysSinceStart = 0;
        [MMReadOnly] [SerializeField] protected int currentMinutesInHour;
        [MMReadOnly] [SerializeField] protected int currentHoursInDay;
        [MMReadOnly] [SerializeField] protected int currentDaysInSeason = 0;
        [MMReadOnly] [SerializeField] protected SeasonData currentSeasonData;
        [MMReadOnly] [SerializeField] protected WeatherData currentWeather;

        [Header("Seasons")] [SerializeField] protected SeasonData[] seasons;
        [SerializeField] protected VolumeProfile defaultVolumeProfile;
        [SerializeField] protected Volume postProcessingVolume;

        [Header("Weather")] [SerializeField] protected Material noWeatherMaterial;
        // [SerializeField] protected Material _globalWeatherMaterial;
        protected WeatherRendererFeature weatherRendererFeature;

        protected float TimeSinceLastUpdate = 0f;

        private Dictionary<Season, SeasonData> _seasonDataDict = new();
        private GameObject _weatherParentGo;


        protected override void Awake()
        {
            base.Awake();

            var renderer = (GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset).GetRenderer(0);
            var property = typeof(ScriptableRenderer).GetProperty("rendererFeatures", BindingFlags.NonPublic | BindingFlags.Instance);
            List<ScriptableRendererFeature> features = property.GetValue(renderer) as List<ScriptableRendererFeature>;
            weatherRendererFeature = features.FirstOrDefault(f => f is WeatherRendererFeature) as WeatherRendererFeature;

            // weatherRendererFeature.Initialize(_globalWeatherMaterial);

            // if(daylightColorGradients.Length != Enum.GetNames(typeof(SeasonData)).Length)
            // {
            //     Debug.LogWarning("UrTimeManager: The number of daylight color gradients does not match the number of seasons.");
            // }

            // TODO: Load current time from save data
        }
        

        public override void Initialization()
        {
            base.Initialization();
            _weatherParentGo = new GameObject("Weather");
            _weatherParentGo.transform.SetParent(transform);

            // We assume that we don't have any colliding season indices... TODO: Maybe not ideal but may be good for modding?
            _seasonDataDict = seasons.ToDictionary(d => d.season);


            currentDaysInSeason = startingDay - 1; // Will be increased by StartNewDay
            StartNewDay();

            // Wait for one frame, TODO: Better way to do this?
            UpdateDayLight();
        }


        protected override void Update()
        {
            base.Update();
            float deltaTime = Time.deltaTime * CurrentTimeScale;
            currentTotalTicks += deltaTime;
            TimeSinceLastUpdate += deltaTime;

            // Instead of advancing minutes by 1, advance in 10-minute increments.
            if (TimeSinceLastUpdate >= secondsPerInGameMinute)
            {
                int increments = Mathf.FloorToInt(TimeSinceLastUpdate / secondsPerInGameMinute);
                // Each increment represents 10 in-game minutes
                currentMinutesInHour += 10 * increments;
                TimeSinceLastUpdate -= increments * secondsPerInGameMinute;
            }

            // Handle minute overflow into hours (may add multiple hours)
            if (currentMinutesInHour >= 60)
            {
                UpdateDayLight();
                int hoursToAdd = currentMinutesInHour / 60;
                currentMinutesInHour %= 60;
                currentHoursInDay += hoursToAdd;
            }

            if (currentHoursInDay >= endOfDay)
            {
                EndDay();
            }
        }

        private void EndDay()
        {
            // SetTimeScaleTo(0);
            // To test, we just start a new day immediately
            StartNewDay();
            // TODO: Throw event
        }

        public void StartNewDay()
        {
            // TODO: Throw event
            currentDaysSinceStart++;
            currentHoursInDay = startOfDay;
            if (!currentSeasonData)
            {
                StartSeason(startingSeason);
            }
            else if (currentDaysInSeason >= numberOfDaysInSeason)
            {
                StartSeason(seasons[currentSeasonData.index % seasons.Length].season);
            }
            else
            {
                currentDaysInSeason++;
            }

            var newWeather = currentSeasonData.weatherData.GetRandomItem();
            StartCoroutine(UpdateWeather(newWeather));
            UpdateDayLight();
        }

        public IEnumerator UpdateWeather(WeatherData weather)
        {
            currentWeather = weather;
            postProcessingVolume.profile =
                weather.postProcessingProfile ? weather.postProcessingProfile : defaultVolumeProfile;
            _weatherParentGo.transform.MMDestroyAllChildren();

            if (weather.weatherEffectPrefab)
            {
                var weatherGo = Instantiate(weather.weatherEffectPrefab, _weatherParentGo.transform);
                var feedbacks = weatherGo.GetComponent<MMF_Player>();
                if (feedbacks)
                {
                    feedbacks.AutoPlayOnStart = true;
                }
            }

            yield return null;
            WeatherUpdateEvent.Trigger(weather);
        }

        public void StartSeason(Season season)
        {
            currentDaysInSeason = 0;
            currentSeasonData = _seasonDataDict?[season];
            SeasonStartEvent.Trigger(currentSeasonData);
        }

        private void UpdateDayLight()
        {
            var dayProgress = (float)(currentHoursInDay - startOfDay) / (endOfDay - startOfDay);
            var daylightGradient = currentWeather.overrideDaylightColor
                ? currentWeather.daylightColorGradient
                : currentSeasonData.daylightColorGradient;
            var currentColor = daylightGradient.Evaluate(dayProgress);
            DayLightUpdateEvent.Trigger(currentColor);
        }
    }
}