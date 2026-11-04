using System;
using Core.TimeAndWeather;
using UnityEngine;
using UnityEngine.UIElements;

namespace UI.Shared
{
    [RequireComponent(typeof(UIDocument))]
    public sealed class CutsceneSkipConfirmation : ManagedUIScreen
    {
        [SerializeField] private TimeScaleController timeScaleController;
        private VisualElement _root;
        private Button _keepWatching;
        private Action _confirmed;
        private int _openedFrame = -1, _closedFrame = -1;
        public bool IsOpen => IsManagedOpen;

        private void OnEnable() => BindDocument();

        private void BindDocument()
        {
            var root = GetComponent<UIDocument>().rootVisualElement;
            if (ReferenceEquals(root, _root)) return;
            _root = root;
            root.StretchToParentSize();
            root.pickingMode = PickingMode.Ignore;
            var overlay = root.Q("skipConfirmation")
                ?? throw new InvalidOperationException("Cutscene skip confirmation requires its layout.");
            _keepWatching = root.Q<Button>("keepWatching")
                ?? throw new InvalidOperationException("Cutscene skip confirmation requires Keep watching.");
            var skip = root.Q<Button>("confirmSkip")
                ?? throw new InvalidOperationException("Cutscene skip confirmation requires Skip cutscene.");
            _keepWatching.clicked += Dismiss;
            skip.clicked += Confirm;
            overlay.RegisterCallback<NavigationSubmitEvent>(evt =>
            {
                if (ReceivesInput && _openedFrame == Time.frameCount) evt.StopImmediatePropagation();
            }, TrickleDown.TrickleDown);
            overlay.RegisterCallback<NavigationCancelEvent>(evt =>
            {
                if (!ReceivesInput) return;
                Dismiss();
                evt.StopPropagation();
            });
            overlay.RegisterCallback<KeyDownEvent>(evt =>
            {
                if (!ReceivesInput || evt.keyCode != KeyCode.Escape) return;
                Dismiss();
                evt.StopPropagation();
            });
            RebindRoot(overlay);
        }

        public bool Show(Action confirmed)
        {
            if (confirmed == null) throw new ArgumentNullException(nameof(confirmed));
            if (IsOpen || _closedFrame == Time.frameCount) return false;
            if (!timeScaleController) throw new InvalidOperationException("Cutscene skip confirmation requires the time scale controller.");
            BindDocument();
            _confirmed = confirmed;
            _openedFrame = Time.frameCount;
            if (!OpenScreen(pauseMode: ScreenPauseMode.None)) { _confirmed = null; return false; }
            timeScaleController.SetPaused(this, true);
            _keepWatching.Focus();
            return true;
        }

        private void Dismiss()
        {
            if (!ReceivesInput || _openedFrame == Time.frameCount) return;
            PlayUISound(UISoundCue.Click);
            CloseScreen();
        }

        private void Confirm()
        {
            if (!ReceivesInput || _openedFrame == Time.frameCount) return;
            var confirmed = _confirmed;
            PlayUISound(UISoundCue.Click);
            // The runner acquires its exit pause before this screen releases its own.
            try { confirmed(); }
            finally { CloseScreen(); }
        }

        public void Hide() => CloseScreen(false);

        protected override void OnScreenClosed()
        {
            timeScaleController.SetPaused(this, false);
            _confirmed = null;
            _closedFrame = Time.frameCount;
        }
    }
}
