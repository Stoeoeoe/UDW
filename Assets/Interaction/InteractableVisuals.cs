using UnityEngine;

namespace Interaction
{
    /// <summary>Optional visual-only child for an interactable's current state.</summary>
    public sealed class InteractableVisuals : MonoBehaviour
    {
        [SerializeField] private Transform visualAnchor;
        [SerializeField] private GameObject ReadyPrefab;
        [SerializeField] private GameObject InCooldownPrefab;
        [SerializeField] private GameObject UsedUpPrefab;

        private GameObject _visualInstance;
        private GameObject _shownPrefab;

        public void Show(InteractionState state)
        {
            var prefab = state switch
            {
                InteractionState.Ready => ReadyPrefab,
                InteractionState.CoolingDown => InCooldownPrefab ? InCooldownPrefab : ReadyPrefab,
                InteractionState.UsedUp => UsedUpPrefab ? UsedUpPrefab : ReadyPrefab,
                _ => null
            };

            if (_shownPrefab == prefab && (_visualInstance || !prefab)) return;
            ClearVisual();
            _shownPrefab = prefab;
            _visualInstance = prefab ? Instantiate(prefab, visualAnchor ? visualAnchor : transform) : null;
        }

        private void OnDisable() => ClearVisual();
        private void OnDestroy() => ClearVisual();

        private void ClearVisual()
        {
            if (_visualInstance)
            {
                if (Application.isPlaying) Destroy(_visualInstance);
                else DestroyImmediate(_visualInstance);
            }
            _visualInstance = null;
            _shownPrefab = null;
        }
    }
}
