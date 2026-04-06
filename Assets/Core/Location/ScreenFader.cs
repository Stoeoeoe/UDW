using DG.Tweening;
using UnityEngine;

namespace Core.Location
{
    [RequireComponent(typeof(CanvasGroup))]
    public class ScreenFader : MonoBehaviour
    {
        [SerializeField] private float _duration = 0.3f;
        [SerializeField] private Ease _ease = Ease.Linear;

        private CanvasGroup _canvasGroup;

        private void Awake()
        {
            _canvasGroup = GetComponent<CanvasGroup>();
            _canvasGroup.alpha = 1f;
            _canvasGroup.blocksRaycasts = true;
            _canvasGroup.interactable = false;
        }

        public Tween FadeIn() =>
            _canvasGroup.DOFade(0f, _duration)
                .SetEase(_ease)
                .SetUpdate(true)
                .OnComplete(() => _canvasGroup.blocksRaycasts = false);

        public Tween FadeOut() =>
            _canvasGroup.DOFade(1f, _duration)
                .SetEase(_ease)
                .SetUpdate(true)
                .OnStart(() => _canvasGroup.blocksRaycasts = true);
    }
}
