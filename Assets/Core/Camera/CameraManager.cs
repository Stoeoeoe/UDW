using System;
using Character;
using Core.Events;
using Core.Location;
using Core.Tile;
using DG.Tweening;
using Unity.Cinemachine;
using UnityEngine;

namespace Core.Camera
{
    /// <summary>
    /// Scene-level camera manager.
    /// Assign the player-follow VCam in the Inspector. It will automatically set its Follow
    /// target when the main character registers (or changes), giving you player-follow for free.
    ///
    /// Cutscene pattern: call ActivateVCam(cutsceneCam) to push it over the player cam via
    /// priority, then DeactivateVCam when done to hand control back.
    /// </summary>
    public class CameraManager : Singleton<CameraManager>, IEventListener<MainCharacterChangedEvent>, ILocationLifecycle
    {
        [Tooltip("The virtual camera used to follow the player. Auto-discovered if left empty.")] [SerializeField]
        private CinemachineCamera playerFollowVCam;

        [Tooltip("Base priority of the player follow cam. Cutscene cams should use a higher value.")] [SerializeField]
        private int playerFollowPriority = 10;

        [SerializeField] CinemachineConfiner2D confiner;

        private float _shakeDuration, _shakeElapsed, _shakeStrength;
        internal Vector3 ShakeOffset { get; private set; }

        [Tooltip("Easing used for both screen flash fades.")]
        [SerializeField] private Ease flashEase = Ease.InOutQuad;

        private UnityEngine.UI.Image _flashImage;
        private Color _flashColor;
        private float _flashDuration, _flashElapsed, _flashInEnd, _flashOutStart;

        internal void PrepareFlash()
        {
            if (_flashImage) return; // This manager owns one overlay, shared by every flash.
            var overlay = new GameObject("ScreenFlash", typeof(RectTransform), typeof(Canvas));
            overlay.transform.SetParent(transform, false);
            var canvas = overlay.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = short.MaxValue;
            var panel = new GameObject("Color", typeof(RectTransform), typeof(UnityEngine.UI.Image));
            panel.transform.SetParent(overlay.transform, false);
            var rect = (RectTransform)panel.transform;
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = rect.offsetMax = Vector2.zero;
            _flashImage = panel.GetComponent<UnityEngine.UI.Image>();
            _flashImage.raycastTarget = false;
            _flashImage.enabled = false;
        }

        public static void ValidateFlash(double durationSeconds, double easeInSeconds, double holdSeconds, double easeOutSeconds)
        {
            ValidateTime(durationSeconds, nameof(durationSeconds));
            ValidateTime(easeInSeconds, nameof(easeInSeconds));
            ValidateTime(holdSeconds, nameof(holdSeconds));
            ValidateTime(easeOutSeconds, nameof(easeOutSeconds));
            if (easeInSeconds + holdSeconds + easeOutSeconds == 0)
                throw new ArgumentException("A flash requires at least one nonzero phase time.");

            static void ValidateTime(double value, string name)
            {
                if (!double.IsFinite(value) || value < 0 || value > float.MaxValue)
                    throw new ArgumentOutOfRangeException(name, "Flash times must be finite and nonnegative.");
            }
        }

        /// <summary>Flashes the whole screen, replacing the current flash. Phase times scale to the total duration.</summary>
        public void Flash(Color color, float durationSeconds = 1.1f, float easeInSeconds = 0.05f,
            float holdSeconds = 1f, float easeOutSeconds = 0.05f)
        {
            ValidateFlash(durationSeconds, easeInSeconds, holdSeconds, easeOutSeconds);
            for (var channel = 0; channel < 4; channel++)
                if (!float.IsFinite(color[channel]) || color[channel] < 0 || color[channel] > 1)
                    throw new ArgumentOutOfRangeException(nameof(color), "Flash color channels must be between zero and one.");
            PrepareFlash();
            var total = (double)easeInSeconds + holdSeconds + easeOutSeconds;
            _flashInEnd = (float)(easeInSeconds / total);
            _flashOutStart = (float)((easeInSeconds + (double)holdSeconds) / total);
            _flashColor = color;
            _flashDuration = durationSeconds;
            _flashElapsed = 0;
            _flashImage.enabled = durationSeconds > 0;
            AdvanceFlash(0);
        }

        private void AdvanceFlash(float deltaTime)
        {
            if (_flashDuration == 0) return;
            _flashElapsed += deltaTime;
            if (_flashElapsed >= _flashDuration) { StopFlash(); return; }
            var progress = _flashElapsed / _flashDuration;
            var opacity = progress < _flashInEnd
                ? DOVirtual.EasedValue(0, 1, progress / _flashInEnd, flashEase)
                : progress < _flashOutStart ? 1f
                : DOVirtual.EasedValue(1, 0, (progress - _flashOutStart) / (1 - _flashOutStart), flashEase);
            var color = _flashColor;
            color.a *= opacity;
            _flashImage.color = color;
        }

        private void StopFlash()
        {
            _flashDuration = _flashElapsed = 0;
            _flashImage.enabled = false;
        }

        internal void PrepareShake()
        {
            if (!playerFollowVCam)
                throw new InvalidOperationException("Screen shake requires the configured player-follow Cinemachine camera.");
            AttachShake(playerFollowVCam);
        }

        private void AttachShake(CinemachineCamera camera)
        {
            var extension = camera.GetComponent<ScreenShakeExtension>();
            if (!extension) extension = camera.gameObject.AddComponent<ScreenShakeExtension>();
            extension.Bind(this);
        }

        public static void ValidateShake(double durationSeconds, double strength)
        {
            if (!double.IsFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > float.MaxValue)
                throw new ArgumentOutOfRangeException(nameof(durationSeconds), "Shake duration must be finite and nonnegative.");
            if (!double.IsFinite(strength) || strength < 0 || strength > float.MaxValue)
                throw new ArgumentOutOfRangeException(nameof(strength), "Shake strength must be finite and nonnegative.");
        }

        /// <summary>Starts a camera-space shake, replacing any current shake. Strength is in world units.</summary>
        public void Shake(float durationSeconds, float strength)
        {
            ValidateShake(durationSeconds, strength);
            PrepareShake();
            _shakeDuration = durationSeconds;
            _shakeStrength = strength;
            _shakeElapsed = 0;
            if (durationSeconds == 0 || strength == 0) StopShake();
            else AdvanceShake(0);
        }

        public void StopShake()
        {
            _shakeDuration = _shakeElapsed = _shakeStrength = 0;
            ShakeOffset = Vector3.zero;
        }

        private void Update()
        {
            AdvanceShake(Time.deltaTime);
            AdvanceFlash(Time.unscaledDeltaTime);
        }

        private void AdvanceShake(float deltaTime)
        {
            if (_shakeDuration == 0) return;
            _shakeElapsed += deltaTime;
            if (_shakeElapsed >= _shakeDuration) { StopShake(); return; }
            var amplitude = _shakeStrength * (1 - _shakeElapsed / _shakeDuration);
            var phase = _shakeElapsed * 25;
            ShakeOffset = new Vector3(Mathf.PerlinNoise(phase, 0.37f) * 2 - 1,
                Mathf.PerlinNoise(0.73f, phase) * 2 - 1, 0) * amplitude;
        }

        protected override void OnAwake()
        {
            PrepareFlash();
            if (playerFollowVCam == null)
                playerFollowVCam = FindFirstObjectByType<CinemachineCamera>();

            if (playerFollowVCam != null)
                playerFollowVCam.Priority = playerFollowPriority;

            // In case the player already exists (e.g. persistent character, re-loaded scene)
            var existing = MainCharacter.CurrentMainCharacter;
            if (existing != null)
                FollowTarget(existing.transform);
        }

        private void OnEnable()
        {
            this.Subscribe();
            LevelManager.Instance.RegisterLifecycle(this);
        }

        private void OnDisable()
        {
            StopShake();
            StopFlash();
            this.Unsubscribe();
            LevelManager.Instance.UnregisterLifecycle(this);
        }

        public void OnEvent(MainCharacterChangedEvent e)
        {
            if (e.MainCharacter)
                FollowTarget(e.MainCharacter.transform);
        }

        // ── Public API ────────────────────────────────────────────────────────────

        /// <summary>Points the player follow cam at the given transform.</summary>
        public void FollowTarget(Transform target)
        {
            if (playerFollowVCam)
                playerFollowVCam.Follow = target;
        }

        /// <summary>Detaches the player follow cam (camera freezes in place).</summary>
        public void StopFollowing()
        {
            if (playerFollowVCam != null)
                playerFollowVCam.Follow = null;
        }

        /// <summary>
        /// Activates a vcam at the given priority, making it the live cam.
        /// Default priority (20) beats the player follow cam (10).
        /// </summary>
        public void ActivateVCam(CinemachineCamera vcam, int priority = 20)
        {
            if (vcam != null)
            {
                AttachShake(vcam);
                vcam.Priority = priority;
            }
        }

        /// <summary>Returns a vcam to inactive state (priority 0), restoring player follow.</summary>
        public void DeactivateVCam(CinemachineCamera vcam)
        {
            if (vcam != null)
                vcam.Priority = 0;
        }

        public void OnLocationEnter(LocationData location)
        {
            if (confiner == null) return;

            var bounds = MapManager.Instance.CurrentBounds;
            var mapCollider = confiner.BoundingShape2D as BoxCollider2D;
            if (!mapCollider)
            {
                throw new InvalidOperationException("Map collider is not a box collider.");
            }
            // Ignore empty bounds
            if (bounds.size == Vector3.zero) return;

            var colliderTransform = mapCollider.transform;
            var worldMin = bounds.min;
            var worldMax = bounds.max;

            var localBottomLeft = colliderTransform.InverseTransformPoint(new Vector3(worldMin.x, worldMin.y, 0f));
            var localTopLeft = colliderTransform.InverseTransformPoint(new Vector3(worldMin.x, worldMax.y, 0f));
            var localBottomRight = colliderTransform.InverseTransformPoint(new Vector3(worldMax.x, worldMin.y, 0f));
            var localTopRight = colliderTransform.InverseTransformPoint(new Vector3(worldMax.x, worldMax.y, 0f));

            var localMin = Vector2.Min(
                Vector2.Min((Vector2)localBottomLeft, (Vector2)localTopLeft),
                Vector2.Min((Vector2)localBottomRight, (Vector2)localTopRight));
            var localMax = Vector2.Max(
                Vector2.Max((Vector2)localBottomLeft, (Vector2)localTopLeft),
                Vector2.Max((Vector2)localBottomRight, (Vector2)localTopRight));

            mapCollider.offset = (localMin + localMax) * 0.5f;
            mapCollider.size = localMax - localMin;

            // TODO: Check if we really always need to call this? Expensive operation, apparently!
            confiner.InvalidateBoundingShapeCache();
            if (!confiner.BoundingShapeIsBaked)
            {
                // Ensure we have a valid vcam to bake with; try to auto-find if not assigned
                var bakeCam = playerFollowVCam ?? FindFirstObjectByType<CinemachineCamera>();
                confiner.BakeBoundingShape(bakeCam, 5);
            }
            
            // Also follow character
            var character = MainCharacter.CurrentMainCharacter;
            if (character)
            {
                FollowTarget(character.transform);
            }
        }

        public void OnLocationLeave(LocationData location)
        {
            StopShake();
        }
    }
}
