using System;

namespace Core.TimeAndWeather
{
    /// <summary>A deadline on a clock supplied by the caller. It does not schedule work.</summary>
    public sealed class Cooldown
    {
        private float _expiresAt;
        private bool _started;

        public void Start(float now, float duration)
        {
            duration = Math.Max(0f, duration);
            _expiresAt = now + duration;
            _started = duration > 0f;
        }

        public bool IsActive(float now) => _started && now < _expiresAt;

        public float Remaining(float now) => IsActive(now) ? _expiresAt - now : 0f;

        public void Reset()
        {
            _started = false;
            _expiresAt = 0f;
        }
    }
}
