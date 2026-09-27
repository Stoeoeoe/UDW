using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Core.Game;
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
    // TODO: Remove MMTimeManager
    public class UrTimeManager : Singleton<UrTimeManager>
    {
        [Header("Time Settings")] [SerializeField]
        protected Season startingSeason = Season.Spring;

        [SerializeField] protected int startingDay = 5;
        [SerializeField] protected int startOfDay = 6;
        [SerializeField] protected int endOfDay = 23;
        [SerializeField] protected int numberOfDaysInSeason = 14;
        [SerializeField] protected float secondsPerInGameMinute = 10f; // TODO: Probably wrong? Seems too fast

        [Header("Current Conditions")]
        [MMReadOnly] [SerializeField] protected SeasonData currentSeasonData;
        [MMReadOnly] [SerializeField] protected WeatherData currentWeather;

        [Header("Seasons")] [SerializeField] protected SeasonData[] seasons;
        [SerializeField] protected VolumeProfile defaultVolumeProfile;
        [SerializeField] protected Volume postProcessingVolume;

        [Header("Weather")] [SerializeField] protected Material noWeatherMaterial;

        // [SerializeField] protected Material _globalWeatherMaterial;
        protected WeatherRendererFeature weatherRendererFeature;

        private Dictionary<Season, SeasonData> _seasonDataDict = new();
        private GameObject _weatherParentGo;

        public UrTime CurrentTime
        {
            get
            {
                var time = GameState.Time;
                return new UrTime(time.season, time.dayOfSeason, time.hour, time.minute);
            }
        }

        // --- Time scale / MMTimeManager-like functionality copied/adapted ---
        [Header("Time Scale (Integrated)")]
        /// The reference time scale, to which the system will go back to after all time is changed
        [Tooltip("The reference time scale, to which the system will go back to after all time is changed")]
        public float NormalTimeScale = 1f;

        [Header("Impacted Values")] 
        [Tooltip("whether or not to update Time.timeScale when changing time scale")]
        public bool UpdateTimescale = true; 
        [Tooltip("whether or not to update Time.fixedDeltaTime when changing time scale")]
        public bool UpdateFixedDeltaTime = true; 
        [Tooltip("whether or not to update Time.maximumDeltaTime when changing time scale")]
        public bool UpdateMaximumDeltaTime = true;

        [Header("Debug")] 
        [Tooltip("the current, real time, time scale")]
        [MMReadOnly]
        public float CurrentTimeScale = 1f;
        [Tooltip("the time scale the system is lerping towards")]
        [MMReadOnly]
        public float TargetTimeScale = 1f;

        protected Stack<MoreMountains.Feedbacks.TimeScaleProperties> _timeScaleProperties;
        protected MoreMountains.Feedbacks.TimeScaleProperties _currentProperty;
        protected MoreMountains.Feedbacks.TimeScaleProperties _resetProperty;
        protected float _initialFixedDeltaTime = 0f;
        protected float _initialMaximumDeltaTime = 0f;
        protected float _startedAt;
        protected bool _lerpingBackToNormal = false;
        protected float _timeScaleLastTime = float.NegativeInfinity;
        protected float _initialTimeScale = 1f;
        // --- end of integrated time scale fields ---

        protected override void Awake()
        {
            base.Awake();

            // Initialize timescale stack (pre-initialization from MMTimeManager)
            PreInitialization();

            var renderer = (GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset).GetRenderer(0);
            var property =
                typeof(ScriptableRenderer).GetProperty("rendererFeatures",
                    BindingFlags.NonPublic | BindingFlags.Instance);
            List<ScriptableRendererFeature> features = property.GetValue(renderer) as List<ScriptableRendererFeature>;
            weatherRendererFeature =
                features.FirstOrDefault(f => f is WeatherRendererFeature) as WeatherRendererFeature;

            // weatherRendererFeature.Initialize(_globalWeatherMaterial);

            // if(daylightColorGradients.Length != Enum.GetNames(typeof(SeasonData)).Length)
            // {
            //     Debug.LogWarning("UrTimeManager: The number of daylight color gradients does not match the number of seasons.");
            // }

        }


        public void Start()
        {
            // Time-scale initialization
            TargetTimeScale = NormalTimeScale;
            _initialFixedDeltaTime = Time.fixedDeltaTime;
            _initialMaximumDeltaTime = Time.maximumDeltaTime;
            ApplyTimeScale(NormalTimeScale);

            _weatherParentGo = new GameObject("Weather");
            _weatherParentGo.transform.SetParent(transform);

            // We assume that we don't have any colliding season indices... TODO: Maybe not ideal but may be good for modding?
            _seasonDataDict = seasons.ToDictionary(d => d.season);


            var time = GameState.Time;
            if (time.initialized)
            {
                RefreshConditionsFromState();
            }
            else
            {
                // The starting date is not a day transition: existing plants must not grow.
                time.daysSinceStart = 1;
                StartSeason(startingSeason);
                time.dayOfSeason = startingDay;
                time.hour = startOfDay;
                time.minute = 0;
                time.secondsTowardNextMinute = 0f;
                time.initialized = true;
                StartCoroutine(UpdateWeather(currentSeasonData.weatherData.GetRandomItem()));
            }

            UpdateDayLight();
            _started = true;
        }

        private bool _started;

        /// <summary>Refreshes runtime conditions after GameState.Load, without advancing time.</summary>
        public void ApplySavedTime()
        {
            if (!_started) return; // Start will read the restored state instead.
            RefreshConditionsFromState();
            UpdateDayLight();
        }

        private void RefreshConditionsFromState()
        {
            currentSeasonData = _seasonDataDict[GameState.Time.season];
            StartCoroutine(UpdateWeather(currentSeasonData.weatherData.GetRandomItem()));
        }


        protected void Update()
        {
            // if we have things in our stack, we handle them, otherwise we reset to the normal time scale
            if (_timeScaleProperties != null)
            {
                while (_timeScaleProperties.Count > 0)
                {
                    _currentProperty = _timeScaleProperties.Peek();
                    TargetTimeScale = _currentProperty.TimeScale;
                    _currentProperty.Duration -= Time.unscaledDeltaTime;

                    _timeScaleProperties.Pop();
                    _timeScaleProperties.Push(_currentProperty);

                    if(_currentProperty.Duration > 0f || _currentProperty.Infinite)
                    {
                        break; // keep current property values
                    }
                    else
                    {
                        Unfreeze(); // pop current property
                    }
                }

                if (_timeScaleProperties.Count == 0)
                {
                    TargetTimeScale = NormalTimeScale;
                }

                // we apply our time scale
                if (_currentProperty.TimeScaleLerp)
                {
                    if (_currentProperty.TimeScaleLerpMode == MoreMountains.Feedbacks.MMTimeScaleLerpModes.Speed)
                    {
                        if (_currentProperty.LerpSpeed <= 0) { _currentProperty.LerpSpeed = 1; }
                        ApplyTimeScale(Mathf.Lerp(Time.timeScale, TargetTimeScale, Time.unscaledDeltaTime * _currentProperty.LerpSpeed));
                    }
                    else if (_currentProperty.TimeScaleLerpMode == MoreMountains.Feedbacks.MMTimeScaleLerpModes.Duration)
                    {
                        float timeSinceStart = Time.unscaledTime - _startedAt;

                        if (timeSinceStart < _currentProperty.TimeScaleLerpDuration)
                        {
                            float progress = MoreMountains.Tools.MMMaths.Remap(timeSinceStart, 0f, _currentProperty.TimeScaleLerpDuration, 0f,
                                1f);
                            float delta = _currentProperty.TimeScaleLerpCurve.Evaluate(progress);
                            float newValue = MoreMountains.Tools.MMMaths.Remap(delta, 0f, 1f, _initialTimeScale, TargetTimeScale);
                            ApplyTimeScale(newValue);
                        }
                        else 
                        {
                            ApplyTimeScale(TargetTimeScale);
                            if (_lerpingBackToNormal)
                            {
                                _lerpingBackToNormal = false;
                                _timeScaleProperties.Pop();
                            }    
                        }
                    }
                }
                else
                {
                    ApplyTimeScale(TargetTimeScale);
                }
            }
            // --- end of integrated time scale logic ---

            var time = GameState.Time;
            float deltaTime = Time.deltaTime * CurrentTimeScale;
            time.secondsTowardNextMinute += deltaTime;

            // Instead of advancing minutes by 1, advance in 10-minute increments.
            if (time.secondsTowardNextMinute >= secondsPerInGameMinute)
            {
                int increments = Mathf.FloorToInt(time.secondsTowardNextMinute / secondsPerInGameMinute);
                // Each increment represents 10 in-game minutes
                time.minute += 10 * increments;
                time.secondsTowardNextMinute -= increments * secondsPerInGameMinute;
            }

            // Handle minute overflow into hours (may add multiple hours)
            if (time.minute >= 60)
            {
                int hoursToAdd = time.minute / 60;
                time.minute %= 60;
                time.hour += hoursToAdd;
                UpdateDayLight();
            }

            if (time.hour >= endOfDay)
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
            var time = GameState.Time;
            time.daysSinceStart++;
            time.hour = startOfDay;
            time.minute = 0;
            time.secondsTowardNextMinute = 0f;
            if (!currentSeasonData)
            {
                StartSeason(startingSeason);
                time.dayOfSeason = 1;
            }
            else if (time.dayOfSeason >= numberOfDaysInSeason)
            {
                StartSeason(seasons[currentSeasonData.index % seasons.Length].season);
                time.dayOfSeason = 1;
            }
            else
            {
                time.dayOfSeason++;
            }

            var newWeather = currentSeasonData.weatherData.GetRandomItem();
            StartCoroutine(UpdateWeather(newWeather));
            UpdateDayLight();
            NewDayEvent.Trigger(time.daysSinceStart);
            Debug.Log("Starting day " + time.daysSinceStart + " of season " + time.season);
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
            var time = GameState.Time;
            time.dayOfSeason = 0;
            time.season = season;
            currentSeasonData = _seasonDataDict?[season];
            SeasonStartEvent.Trigger(currentSeasonData);
        }

        private void UpdateDayLight()
        {
            var dayProgress = (float)(GameState.Time.hour - startOfDay) / (endOfDay - startOfDay);
            var daylightGradient = currentWeather.overrideDaylightColor
                ? currentWeather.daylightColorGradient
                : currentSeasonData.daylightColorGradient;
            var currentColor = daylightGradient.Evaluate(dayProgress);
            DayLightUpdateEvent.Trigger(currentColor);
        }

        // --- Time scale helper methods (from MMTimeManager) ---
        public virtual void PreInitialization()
        {
            _timeScaleProperties = new Stack<MoreMountains.Feedbacks.TimeScaleProperties>();
        }

        protected virtual void ApplyTimeScale(float newValue)
        {
            // if the new timescale is the same as last time, we don't bother updating it
            if (newValue == _timeScaleLastTime)
            {
                return;
            }

            newValue = Mathf.Clamp(newValue,0f, 100f);

            if (UpdateTimescale)
            {
                Time.timeScale = newValue;    
            }

            if (UpdateFixedDeltaTime && (newValue != 0))
            {
                Time.fixedDeltaTime = _initialFixedDeltaTime * newValue;            
            }

            if (UpdateMaximumDeltaTime)
            {
                Time.maximumDeltaTime = _initialMaximumDeltaTime * newValue;
            }

            CurrentTimeScale = Time.timeScale;
            _timeScaleLastTime = CurrentTimeScale;
        }

        protected virtual void SetTimeScale(float newTimeScale)
        {
            _timeScaleProperties.Clear();
            ApplyTimeScale(newTimeScale);
        }

        protected virtual void SetTimeScale(MoreMountains.Feedbacks.TimeScaleProperties timeScaleProperties)
        {
            if (timeScaleProperties.TimeScaleLerp &&
                timeScaleProperties.TimeScaleLerpMode == MoreMountains.Feedbacks.MMTimeScaleLerpModes.Duration)
            {
                timeScaleProperties.Duration = timeScaleProperties.Duration + timeScaleProperties.TimeScaleLerpDuration;
            }
            _startedAt = Time.unscaledTime;
            _timeScaleProperties.Push(timeScaleProperties);
        }

        public virtual void ResetTimeScale()
        {
            SetTimeScale(NormalTimeScale);
        }

        public virtual void Unfreeze()
        {
            if (_timeScaleProperties.Count > 0)
            {
                _resetProperty = _timeScaleProperties.Peek();
                _timeScaleProperties.Pop();
            }

            if (_timeScaleProperties.Count == 0)
            {
                if (_resetProperty.TimeScaleLerp && _resetProperty.TimeScaleLerpMode == MoreMountains.Feedbacks.MMTimeScaleLerpModes.Duration && _resetProperty.TimeScaleLerpOnUnfreeze)
                {
                    _lerpingBackToNormal = true;
                    MoreMountains.Feedbacks.MMTimeScaleEvent.Trigger(MoreMountains.Feedbacks.MMTimeScaleMethods.For, NormalTimeScale, _resetProperty.TimeScaleLerpDurationOnUnfreeze, _resetProperty.TimeScaleLerp, 
                        _resetProperty.LerpSpeed, true, MoreMountains.Feedbacks.MMTimeScaleLerpModes.Duration, _resetProperty.TimeScaleLerpCurveOnUnfreeze, _resetProperty.TimeScaleLerpDurationOnUnfreeze);    
                }
                else
                {
                    ResetTimeScale();    
                }
            }
        }

        public virtual void SetTimeScaleTo(float newNormalTimeScale)
        {
            MoreMountains.Feedbacks.MMTimeScaleEvent.Trigger(MoreMountains.Feedbacks.MMTimeScaleMethods.For, newNormalTimeScale, 0f, false, 0f, true);
        }

        public virtual void OnTimeScaleEvent(MoreMountains.Feedbacks.MMTimeScaleMethods timeScaleMethod, float timeScale, float duration, bool lerp, float lerpSpeed, bool infinite,
            MoreMountains.Feedbacks.MMTimeScaleLerpModes timeScaleLerpMode = MoreMountains.Feedbacks.MMTimeScaleLerpModes.Speed, MoreMountains.Tools.MMTweenType timeScaleLerpCurve = null, float timeScaleLerpDuration = 0.2f, 
            bool timeScaleLerpOnUnfreeze = false, MoreMountains.Tools.MMTweenType timeScaleLerpCurveOnUnfreeze = null, float timeScaleLerpDurationOnUnfreeze = 0.2f)
        {
            MoreMountains.Feedbacks.TimeScaleProperties timeScaleProperty = new MoreMountains.Feedbacks.TimeScaleProperties();
            timeScaleProperty.TimeScale = timeScale;
            timeScaleProperty.Duration = duration;
            timeScaleProperty.TimeScaleLerp = lerp;
            timeScaleProperty.LerpSpeed = lerpSpeed;
            timeScaleProperty.Infinite = infinite;
            timeScaleProperty.TimeScaleLerpOnUnfreeze = timeScaleLerpOnUnfreeze;
            timeScaleProperty.TimeScaleLerpCurveOnUnfreeze = timeScaleLerpCurveOnUnfreeze;
            timeScaleProperty.TimeScaleLerpDurationOnUnfreeze = timeScaleLerpDuration;
            timeScaleProperty.TimeScaleLerpMode = timeScaleLerpMode;
            timeScaleProperty.TimeScaleLerpCurve = timeScaleLerpCurve;
            timeScaleProperty.TimeScaleLerpDuration = timeScaleLerpDuration;
            _initialTimeScale = Time.timeScale;

            switch (timeScaleMethod)
            {
                case MoreMountains.Feedbacks.MMTimeScaleMethods.Reset:
                    ResetTimeScale ();
                    break;

                case MoreMountains.Feedbacks.MMTimeScaleMethods.For:
                    SetTimeScale (timeScaleProperty);
                    break;

                case MoreMountains.Feedbacks.MMTimeScaleMethods.Unfreeze:
                    Unfreeze();
                    break;
            }
        }

        public virtual void OnMMFreezeFrameEvent(float duration)
        {
            MoreMountains.Feedbacks.TimeScaleProperties properties = new MoreMountains.Feedbacks.TimeScaleProperties();
            properties.Duration = duration;
            properties.TimeScaleLerp = false;
            properties.LerpSpeed = 0f;
            properties.TimeScale = 0f;
            SetTimeScale(properties);
        }

        void OnEnable()
        {
            MoreMountains.Feedbacks.MMFreezeFrameEvent.Register(OnMMFreezeFrameEvent);
            MoreMountains.Feedbacks.MMTimeScaleEvent.Register(OnTimeScaleEvent);
        }

        void OnDisable()
        {
            MoreMountains.Feedbacks.MMFreezeFrameEvent.Unregister(OnMMFreezeFrameEvent);
            MoreMountains.Feedbacks.MMTimeScaleEvent.Unregister(OnTimeScaleEvent);
        }
        // --- end of time scale helpers ---
    }
}

