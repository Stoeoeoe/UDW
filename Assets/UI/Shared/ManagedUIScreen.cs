using System;
using Character;
using UnityEngine;
using UnityEngine.UIElements;

namespace UI.Shared
{
    /// <summary>Shared visibility and manager registration for modal UI Toolkit screens.</summary>
    public abstract class ManagedUIScreen : MonoBehaviour
    {
        [Tooltip("Pause character controls, the in-game calendar, both, or neither while this screen is open. UI animations keep running.")]
        [SerializeField] private ScreenPauseMode pauseWhileOpen = ScreenPauseMode.CharacterAndClock;
        public ScreenPauseMode PauseWhileOpen { get => pauseWhileOpen; set => pauseWhileOpen = value; }
        [Tooltip("Optional per-cue overrides. Missing cues use the manager's shared sound profile.")]
        [SerializeField] private UISoundProfile soundOverrides;
        public UISoundProfile SoundOverrides { get => soundOverrides; set => soundOverrides = value; }
        [SerializeField] private string inputActionMap = "UI";
        public string InputActionMap { get => inputActionMap; set => inputActionMap = value; }
        private VisualElement _lastFocused;
        private bool _overlayWasEnabled, _overlayWasFocusable;
        private Action _hide;
        private UrGUIManager _manager;
        private VisualElement _inputOverlay;

        protected bool IsManagedOpen => _manager != null && _manager.IsOpen(this);
        protected bool ReceivesInput => _manager != null && _manager.IsTopScreen(this);

        protected void RebindRoot(VisualElement root)
        {
            if (root == null) throw new ArgumentNullException(nameof(root));
            if (ReferenceEquals(_inputOverlay, root)) return;
            if (_inputOverlay != null)
            {
                _inputOverlay.style.display = DisplayStyle.None;
                RestoreRootSettings();
            }
            _inputOverlay = root;
            _overlayWasEnabled = root.enabledSelf;
            _overlayWasFocusable = root.focusable;
            _lastFocused = null;
            if (IsManagedOpen)
            {
                ShowRoot();
                _manager.RebindScreen(this);
            }
            else HideRoot();
        }

        protected bool OpenScreen(GameCharacter character = null, ScreenPauseMode? pauseMode = null)
        {
            if (_inputOverlay == null) throw new InvalidOperationException("Bind the screen root before opening it.");
            return OpenScreen(ShowRoot, HideRoot, character, pauseMode);
        }

        private void ShowRoot() => _inputOverlay.style.display = DisplayStyle.Flex;
        private void HideRoot() => _inputOverlay.style.display = DisplayStyle.None;
        private void RestoreRootSettings()
        {
            _inputOverlay.SetEnabled(_overlayWasEnabled);
            _inputOverlay.focusable = _overlayWasFocusable;
        }

        protected bool OpenScreen(Action show, Action hide, GameCharacter character = null, ScreenPauseMode? pauseMode = null)
        {
            if (!isActiveAndEnabled) return false;
            if (show == null) throw new ArgumentNullException(nameof(show));
            if (hide == null) throw new ArgumentNullException(nameof(hide));

            var manager = UrGUIManager.Instance;
            _manager = manager;
            _hide = hide;
            try { _manager.Open(this, show, HandleClosed, pauseMode ?? pauseWhileOpen, character); }
            catch
            {
                if (!manager.IsOpen(this)) { _manager = null; _hide = null; }
                throw;
            }
            return IsManagedOpen;
        }

        protected void CloseScreen(bool playSound = true)
        {
            if (_manager != null)
                _manager.Close(this, playSound);
        }

        private void HandleClosed()
        {
            var hide = _hide;
            _hide = null;
            _manager = null;
            if (_inputOverlay != null) RestoreRootSettings();
            hide?.Invoke();
            OnScreenClosed();
        }

        protected virtual void OnScreenClosed() { }
        internal void SetInputActive(bool active)
        {
            if (_inputOverlay != null)
            {
                if (!active)
                {
                    var focused = _inputOverlay.panel?.focusController.focusedElement as VisualElement;
                    if (focused != null && (_inputOverlay == focused || _inputOverlay.Contains(focused)))
                    {
                        _lastFocused = focused;
                        focused.Blur();
                    }
                }
                _inputOverlay.SetEnabled(active && _overlayWasEnabled);
                if (active)
                {
                    _inputOverlay.focusable = true;
                    if (_lastFocused?.panel != null &&
                        (_lastFocused == _inputOverlay || _inputOverlay.Contains(_lastFocused)) &&
                        _lastFocused.canGrabFocus) _lastFocused.Focus();
                    else _inputOverlay.Focus();
                }
            }
            OnInputActiveChanged(active);
        }
        protected virtual void OnInputActiveChanged(bool active) { }
        protected void PlayUISound(UISoundCue cue) => UrGUIManager.Instance?.PlaySound(cue, this);
        protected virtual void OnDisable() => CloseScreen(false);
    }
}
