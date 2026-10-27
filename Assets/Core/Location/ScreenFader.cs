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
        private Color _originalColor;
        private Tween _fade;
        private RectTransform _upperPanel, _lowerPanel;
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
            _originalMaterial = _image.material;
            _originalColor = _image.color;
            if (_effect != Effect.Opacity)
            {
                if (!_wipeMaterial || !_wipeMaterial.HasProperty(Progress) || !_wipeMaterial.HasProperty(Style))
                    throw new InvalidOperationException("Mosaic and iris transitions require a ScreenWipe material.");

                // Each fader owns its progress; never animate the shared material asset.
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
            RestoreNormalPresentation();
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
            RestoreNormalPresentation();
            SetProgress(0f);
            _canvasGroup.blocksRaycasts = false;
        }

        public Tween CoverCutscene(float duration, float holdSeconds = 0)
        {
            _fade?.Kill();
            RestoreNormalPresentation();
            _image.material = null;
            _image.color = Color.black;
            _canvasGroup.alpha = 0f;
            _canvasGroup.blocksRaycasts = true;
            _fade = DOTween.Sequence().Append(_canvasGroup.DOFade(1f, duration).SetEase(Ease.Linear))
                .AppendInterval(holdSeconds).SetUpdate(true)
                .SetRecyclable(false).OnKill(() => _fade = null);
            return _fade;
        }

        public Tween RevealCutscene(float duration)
        {
            _fade?.Kill();
            if (!_upperPanel)
            {
                _upperPanel = CreatePanel("CutsceneUpperPanel");
                _lowerPanel = CreatePanel("CutsceneLowerPanel");
            }
            _image.material = null;
            _image.color = Color.clear;
            _upperPanel.gameObject.SetActive(true);
            _lowerPanel.gameObject.SetActive(true);
            _canvasGroup.alpha = 1f;
            _canvasGroup.blocksRaycasts = true;
            SetCenterOpening(0f);
            var opening = 0f;
            _fade = DOTween.To(() => opening, value => { opening = value; SetCenterOpening(value); }, 1f, duration)
                .SetEase(Ease.OutCubic).SetUpdate(true).SetRecyclable(false)
                .OnComplete(() =>
                {
                    RestoreNormalPresentation();
                    SetProgress(0f);
                    _canvasGroup.blocksRaycasts = false;
                }).OnKill(() => _fade = null);
            return _fade;
        }

        private RectTransform CreatePanel(string panelName)
        {
            var panel = new GameObject(panelName, typeof(RectTransform), typeof(UnityEngine.UI.Image));
            panel.layer = gameObject.layer;
            panel.transform.SetParent(transform, false);
            var image = panel.GetComponent<UnityEngine.UI.Image>();
            image.color = Color.black;
            image.raycastTarget = false;
            return (RectTransform)panel.transform;
        }

        private void SetCenterOpening(float opening)
        {
            _lowerPanel.anchorMin = Vector2.zero;
            _lowerPanel.anchorMax = new Vector2(1f, (1f - opening) * 0.5f);
            _upperPanel.anchorMin = new Vector2(0f, (1f + opening) * 0.5f);
            _upperPanel.anchorMax = Vector2.one;
            _lowerPanel.offsetMin = _lowerPanel.offsetMax = Vector2.zero;
            _upperPanel.offsetMin = _upperPanel.offsetMax = Vector2.zero;
        }

        private void RestoreNormalPresentation()
        {
            if (_upperPanel) _upperPanel.gameObject.SetActive(false);
            if (_lowerPanel) _lowerPanel.gameObject.SetActive(false);
            _image.enabled = true;
            _image.color = _originalColor;
            _image.material = _runtimeMaterial ? _runtimeMaterial : _originalMaterial;
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
