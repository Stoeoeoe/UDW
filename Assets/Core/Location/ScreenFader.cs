using System;
using DG.Tweening;
using UnityEngine;

namespace Core.Location
{
    /// <summary>Shared opacity, mosaic or character-centered iris transitions, using unscaled time.</summary>
    [RequireComponent(typeof(CanvasGroup), typeof(UnityEngine.UI.Image))]
    public class ScreenFader : MonoBehaviour
    {
        public enum Effect { Opacity, Mosaic, Iris }
        public enum MosaicOrder { Random, LeftToRight, CenterOut }

        [SerializeField] private float _duration = 0.3f;
        [SerializeField] private Ease _ease = Ease.Linear;
        [SerializeField] private Effect _effect;
        [SerializeField] private Material _wipeMaterial;
        [Tooltip("Width and height of each mosaic tile in screen pixels.")]
        [SerializeField, Min(1f)] private float _tileSize = 32f;
        [SerializeField] private MosaicOrder _mosaicOrder;
        [Tooltip("Optional iris silhouette: opaque white keeps the scene visible; black or transparent covers it. Center the shape in a square texture. Without a mask the opening is circular.")]
        [SerializeField] private Texture2D _irisMask;

        private CanvasGroup _canvasGroup;
        private UnityEngine.UI.Image _image;
        private Material _runtimeMaterial, _originalMaterial;
        private Tween _fade;
        private float _progress;
        private Transform _focus;
        private UnityEngine.Camera _focusCamera;
        private static readonly int Progress = Shader.PropertyToID("_Progress");
        private static readonly int TileSize = Shader.PropertyToID("_TileSize");
        private static readonly int Order = Shader.PropertyToID("_Order");
        private static readonly int Style = Shader.PropertyToID("_Style");
        private static readonly int Center = Shader.PropertyToID("_Center");
        private static readonly int Mask = Shader.PropertyToID("_MaskTex");
        private static readonly int UseMask = Shader.PropertyToID("_UseMask");

        private void Awake()
        {
            _canvasGroup = GetComponent<CanvasGroup>();
            _image = GetComponent<UnityEngine.UI.Image>();
            if (_effect != Effect.Opacity)
            {
                if (!_wipeMaterial || !_wipeMaterial.HasProperty(Progress) || !_wipeMaterial.HasProperty(Style))
                    throw new InvalidOperationException("Mosaic and iris transitions require a ScreenWipe material.");

                // Each fader owns its progress; never animate the shared material asset.
                _originalMaterial = _image.material;
                _runtimeMaterial = new Material(_wipeMaterial) { hideFlags = HideFlags.DontSave };
                _runtimeMaterial.SetFloat(Style, _effect == Effect.Iris ? 1f : 0f);
                _runtimeMaterial.SetFloat(TileSize, _tileSize);
                _runtimeMaterial.SetFloat(Order, (int)_mosaicOrder);
                _runtimeMaterial.SetFloat(UseMask, _irisMask ? 1f : 0f);
                if (_irisMask) _runtimeMaterial.SetTexture(Mask, _irisMask);
                _image.material = _runtimeMaterial;
            }
            SetProgress(1f);
            _canvasGroup.blocksRaycasts = true;
            _canvasGroup.interactable = false;
        }

        /// <summary>Reveals the scene. Iris transitions require a focus target and a camera tagged MainCamera.</summary>
        public Tween FadeIn(Transform focus = null) => FadeTo(0f, focus);

        /// <summary>Covers the scene. Iris transitions close around the supplied focus target.</summary>
        public Tween FadeOut(Transform focus = null) => FadeTo(1f, focus);

        private Tween FadeTo(float target, Transform focus)
        {
            if (_effect == Effect.Iris)
            {
                if (!focus) throw new ArgumentNullException(nameof(focus), "An iris transition requires its subject.");
                _focusCamera = UnityEngine.Camera.main;
                if (!_focusCamera) throw new InvalidOperationException("An iris transition requires a camera tagged MainCamera.");
                _focus = focus;
                UpdateIrisCenter();
            }
            _fade?.Kill();
            _canvasGroup.blocksRaycasts = true;
            _fade = DOTween.To(() => _progress, SetProgress, target, _duration)
                .SetEase(_ease)
                .SetUpdate(true)
                // Transition coroutines retain the returned handle until their wait completes.
                .SetRecyclable(false)
                .SetTarget(_canvasGroup)
                .OnComplete(() => _canvasGroup.blocksRaycasts = target > 0f)
                .OnKill(() => _fade = null);
            return _fade;
        }

        private void SetProgress(float progress)
        {
            _progress = progress;
            if (_effect == Effect.Opacity)
                _canvasGroup.alpha = progress;
            else
            {
                // The shader owns coverage; fading the whole image would make its black areas translucent.
                _canvasGroup.alpha = progress > 0f ? 1f : 0f;
                _runtimeMaterial.SetFloat(Progress, progress);
            }
        }

        private void LateUpdate()
        {
            // Follow camera settling as well as the subject while the opening is visible.
            if (_effect == Effect.Iris && _progress > 0f && _progress < 1f)
                UpdateIrisCenter();
        }

        private void UpdateIrisCenter()
        {
            var point = _focusCamera.WorldToViewportPoint(_focus.position);
            var rect = _focusCamera.rect;
            _runtimeMaterial.SetVector(Center, new Vector4(rect.x + point.x * rect.width, rect.y + point.y * rect.height, 0f, 0f));
        }

        /// <summary>Reveals the scene and releases pointer blocking after a transition finishes or is cancelled.</summary>
        public void ShowSceneImmediately()
        {
            _fade?.Kill();
            SetProgress(0f);
            _canvasGroup.blocksRaycasts = false;
        }

        private void OnDestroy()
        {
            _fade?.Kill();
            if (!_runtimeMaterial) return;
            _image.material = _originalMaterial;
            if (Application.isPlaying) Destroy(_runtimeMaterial);
            else DestroyImmediate(_runtimeMaterial);
        }
    }
}
