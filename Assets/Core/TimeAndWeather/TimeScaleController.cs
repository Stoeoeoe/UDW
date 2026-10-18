using System;
using System.Collections.Generic;
using MoreMountains.Feedbacks;
using MoreMountains.Tools;
using UnityEngine;

namespace Core.TimeAndWeather
{
    /// <summary>Owns Unity time scaling for More Mountains slow-motion and freeze-frame requests, independently of the calendar.</summary>
    [DisallowMultipleComponent, DefaultExecutionOrder(-100)]
    public sealed class TimeScaleController : MonoBehaviour
    {
        [SerializeField, Range(0f, 100f)] private float normalTimeScale = 1f;
        [SerializeField] private bool updateTimescale = true;
        [SerializeField] private bool updateFixedDeltaTime = true;
        [SerializeField] private bool updateMaximumDeltaTime = true;

        // Only the top request advances. Underlying effects resume after an overlapping freeze/slow-motion effect.
        private sealed class Request
        {
            public TimeScaleProperties Settings;
            public float Total, Elapsed, FromScale;
            public bool IsReturn;
        }

        private readonly Stack<Request> _requests = new();
        private float _initialFixedDeltaTime, _initialMaximumDeltaTime;

        private void Awake()
        {
            _initialFixedDeltaTime = Time.fixedDeltaTime;
            _initialMaximumDeltaTime = Time.maximumDeltaTime;
            Apply(normalTimeScale);
        }

        private void OnEnable()
        {
            MMTimeScaleEvent.Register(OnTimeScaleEvent);
            MMFreezeFrameEvent.Register(OnFreezeFrame);
        }

        private void OnDisable()
        {
            MMTimeScaleEvent.Unregister(OnTimeScaleEvent);
            MMFreezeFrameEvent.Unregister(OnFreezeFrame);
            ResetScale();
        }

        private void Update() => Advance(Time.unscaledDeltaTime);

        private void Advance(float dt)
        {
            if (_requests.TryPeek(out var top))
            {
                top.Elapsed += dt;
                if (!top.Settings.Infinite && top.Elapsed >= top.Total)
                {
                    Apply(Evaluate(top, dt)); // keeps Time.timeScale correct as FromScale for the return tween
                    ReleaseTop();
                }
            }

            Apply(Current(dt));
        }

        private float Current(float dt) => _requests.TryPeek(out var top) ? Evaluate(top, dt) : normalTimeScale;

        private static float Evaluate(Request request, float dt)
        {
            var s = request.Settings;
            if (!s.TimeScaleLerp || s.TimeScaleLerpMode == MMTimeScaleLerpModes.NoInterpolation)
                return s.TimeScale;
            if (s.TimeScaleLerpMode == MMTimeScaleLerpModes.Speed)
                return Mathf.Lerp(Time.timeScale, s.TimeScale, dt * s.LerpSpeed);

            var progress = s.TimeScaleLerpDuration == 0f ? 1f : Mathf.Clamp01(request.Elapsed / s.TimeScaleLerpDuration);
            return Mathf.LerpUnclamped(request.FromScale, s.TimeScale, s.TimeScaleLerpCurve.Evaluate(progress));
        }

        private void Push(TimeScaleProperties settings, bool isReturn = false)
        {
            ValidateRequest(settings);
            // A fresh gameplay effect supersedes the cosmetic return to normal.
            if (_requests.TryPeek(out var top) && top.IsReturn) _requests.Clear();
            _requests.Push(new Request
            {
                Settings = settings,
                Total = settings.Duration + (settings.TimeScaleLerp && settings.TimeScaleLerpMode == MMTimeScaleLerpModes.Duration
                    ? settings.TimeScaleLerpDuration : 0f),
                FromScale = Time.timeScale,
                IsReturn = isReturn
            });
        }

        private void ReleaseTop()
        {
            if (!_requests.TryPop(out var popped)) { Apply(normalTimeScale); return; }
            var s = popped.Settings;
            if (_requests.Count > 0) return;
            if (s.TimeScaleLerp && s.TimeScaleLerpMode == MMTimeScaleLerpModes.Duration && s.TimeScaleLerpOnUnfreeze)
            {
                Push(new TimeScaleProperties
                {
                    TimeScale = normalTimeScale,
                    TimeScaleLerp = true,
                    TimeScaleLerpMode = MMTimeScaleLerpModes.Duration,
                    TimeScaleLerpDuration = s.TimeScaleLerpDurationOnUnfreeze,
                    TimeScaleLerpCurve = s.TimeScaleLerpCurveOnUnfreeze
                }, isReturn: true);
            }
        }

        private void ResetScale()
        {
            _requests.Clear();
            Apply(normalTimeScale);
        }

        private void Apply(float scale)
        {
            // Guards against NaN from misconfigured feedbacks; authored curves can also overshoot, so clamp to Unity's range.
            scale = float.IsNaN(scale) ? normalTimeScale : Mathf.Clamp(scale, 0f, 100f);
            if (updateTimescale) Time.timeScale = scale;
            // Physics timestep settings stay positive while the simulation is frozen.
            if (scale == 0f) return;
            if (updateFixedDeltaTime) Time.fixedDeltaTime = _initialFixedDeltaTime * scale;
            if (updateMaximumDeltaTime) Time.maximumDeltaTime = _initialMaximumDeltaTime * scale;
        }

        private void OnFreezeFrame(float duration) => Push(new TimeScaleProperties { TimeScale = 0f, Duration = duration });

        private void OnTimeScaleEvent(MMTimeScaleMethods method, float scale, float duration, bool lerp, float lerpSpeed,
            bool infinite, MMTimeScaleLerpModes lerpMode, MMTweenType curve, float lerpDuration,
            bool lerpOnUnfreeze, MMTweenType unfreezeCurve, float unfreezeDuration)
        {
            switch (method)
            {
                case MMTimeScaleMethods.Reset:
                    ResetScale();
                    break;
                case MMTimeScaleMethods.Unfreeze:
                    ReleaseTop();
                    Apply(Current(0f));
                    break;
                case MMTimeScaleMethods.For:
                    Push(new TimeScaleProperties
                    {
                        TimeScale = scale, Duration = duration, Infinite = infinite,
                        TimeScaleLerp = lerp, LerpSpeed = lerpSpeed, TimeScaleLerpMode = lerpMode,
                        TimeScaleLerpCurve = curve, TimeScaleLerpDuration = lerpDuration,
                        TimeScaleLerpOnUnfreeze = lerpOnUnfreeze,
                        TimeScaleLerpCurveOnUnfreeze = unfreezeCurve, TimeScaleLerpDurationOnUnfreeze = unfreezeDuration
                    });
                    break;
                default: throw new ArgumentOutOfRangeException(nameof(method));
            }
        }

        private static void ValidateRequest(TimeScaleProperties s)
        {
            if (s.TimeScaleLerp && s.TimeScaleLerpMode == MMTimeScaleLerpModes.Duration &&
                (s.TimeScaleLerpCurve == null || (s.TimeScaleLerpOnUnfreeze && s.TimeScaleLerpCurveOnUnfreeze == null)))
                throw new ArgumentException("Duration interpolation requires curves.");
        }
    }
}