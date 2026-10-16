using System;
using System.Collections;
using System.Collections.Generic;
using Character;
using Core;
using Core.Context;
using Core.Events;
using Core.Location;
using Core.TimeAndWeather;
using DG.Tweening;
using MoreMountains.Tools;
using UnityEngine;
using UnityEngine.UIElements;

namespace UI.Shared
{
    /// <summary>Manages modal screen order, pause requests, input routing, shared UI sounds, and screen transitions.</summary>
    [DefaultExecutionOrder(200)]
    public sealed class UrGUIManager : Singleton<UrGUIManager>, ILocationLifecycle, IEventListener<MainCharacterChangedEvent>,
        IEventListener<DayTransitionStarted>
    {
        private Input.InputManager _input;
        private MainCharacter _mainCharacter;
        // Saved with each open screen so its callbacks and original sorting order can be restored.
        private sealed class OpenScreenState
        {
            public Action Hide;
            public ScreenPauseMode PauseMode;
            public GameCharacter Character;
            public UIDocument Document;
            public float OriginalSortingOrder;
        }

        private readonly Dictionary<ManagedUIScreen, OpenScreenState> _openScreens = new();
        // Counts let multiple open screens own a pause independently.
        private readonly Dictionary<GameCharacter, int> _characterPauses = new();
        private int _clockPauses;
        // The last screen in the list is the only one that receives input.
        private readonly List<ManagedUIScreen> _screenOrder = new();

        /// <summary>Whether <paramref name="screen"/> is the top screen and receives input.</summary>
        /// <param name="screen">Screen to check.</param>
        public bool IsTopScreen(ManagedUIScreen screen) => _screenOrder.Count > 0 && _screenOrder[^1] == screen;
        [SerializeField] private UISoundProfile soundProfile;
        [Header("Screen transitions")]
        [SerializeField] private ScreenFader screenFader;
        private Tween _transitionTween;

        /// <summary>Raised when disabling the GUI interrupts presentation; sequence owners cancel their own work.</summary>
        public event Action TransitionInterrupted;

        /// <summary>Shared fallback sounds used when a screen has no cue override.</summary>
        public UISoundProfile SoundProfile { get => soundProfile; set => soundProfile = value; }

        /// <summary>Whether any managed screen is open.</summary>
        public static bool HasOpenScreens => Instance != null && Instance._openScreens.Count > 0;

        /// <summary>Whether an open screen currently pauses the game clock.</summary>
        public static bool IsGameClockPaused => Instance != null && Instance._clockPauses > 0;

        /// <summary>Whether an open screen currently pauses <paramref name="character"/>.</summary>
        /// <param name="character">Character to check.</param>
        public static bool IsCharacterPaused(GameCharacter character) =>
            character && Instance != null && Instance._characterPauses.ContainsKey(character);

        protected override void OnAwake()
        {
            _input = Input.InputManager.Instance
                ?? throw new InvalidOperationException("UrGUIManager requires InputManager to initialize first.");
        }

        private void OnEnable()
        {
            this.Subscribe<MainCharacterChangedEvent>();
            this.Subscribe<DayTransitionStarted>();
            BindMainCharacter(CharacterManager.Instance.MainCharacter);
            LevelManager.Instance?.RegisterLifecycle(this);
        }

        /// <summary>Tracks the new main character so its death closes open screens.</summary>
        /// <param name="change">The main-character replacement event.</param>
        public void OnEvent(MainCharacterChangedEvent change) => BindMainCharacter(change.MainCharacter);

        private void BindMainCharacter(MainCharacter character)
        {
            if (ReferenceEquals(_mainCharacter, character)) return;
            if (_mainCharacter is not null) _mainCharacter.OnConditionStateChanged -= OnMainConditionChanged;
            _mainCharacter = character;
            if (_mainCharacter is not null)
            {
                _mainCharacter.OnConditionStateChanged += OnMainConditionChanged;
                OnMainConditionChanged(_mainCharacter.ConditionState);
            }
        }

        private void OnMainConditionChanged(ConditionState condition)
        {
            if (condition == ConditionState.Dead) CloseAll();
        }

        private void Start()
        {
            if (!screenFader) throw new InvalidOperationException("UrGUIManager requires the shared screen fader.");
            LevelManager.Instance?.RegisterLifecycle(this);
        }

        private void OnDisable()
        {
            if (_transitionTween != null)
            {
                ResetTransition();
                TransitionInterrupted?.Invoke();
            }
            this.Unsubscribe<MainCharacterChangedEvent>();
            this.Unsubscribe<DayTransitionStarted>();
            BindMainCharacter(null);
            LevelManager.Instance?.UnregisterLifecycle(this);
            CloseAll();
        }

        /// <summary>Closes menus before the overnight presentation starts.</summary>
        public void OnEvent(DayTransitionStarted change) => CloseAll();

        /// <summary>Covers the scene around the supplied subject; the caller waits before changing gameplay state.</summary>
        public IEnumerator CoverScene(Transform focus)
        {
            _transitionTween = screenFader.FadeOut(focus);
            yield return _transitionTween.WaitForCompletion(true);
        }

        /// <summary>Reveals the scene, optionally playing a cue and holding the cover first.</summary>
        public IEnumerator RevealScene(Transform focus, float holdDuration = 0f, AudioClip cue = null)
        {
            if (cue)
            {
                var options = MMSoundManagerPlayOptions.Default;
                options.MmSoundManagerTrack = MMSoundManager.MMSoundManagerTracks.UI;
                MMSoundManagerSoundPlayEvent.Trigger(cue, options);
            }
            if (holdDuration > 0f) yield return new WaitForSecondsRealtime(holdDuration);
            _transitionTween = screenFader.FadeIn(focus);
            yield return _transitionTween.WaitForCompletion(true);
            _transitionTween = null;
        }

        /// <summary>Stops presentation and reveals the scene immediately when the owning sequence ends or is cancelled.</summary>
        public void ResetTransition()
        {
            _transitionTween?.Kill();
            _transitionTween = null;
            screenFader.ShowSceneImmediately();
        }

        /// <summary>Whether this manager currently owns <paramref name="screen"/>.</summary>
        /// <param name="screen">Screen to check.</param>
        public bool IsOpen(ManagedUIScreen screen) => screen != null && _openScreens.ContainsKey(screen);

        /// <summary>Opens a screen, or updates its pause request while keeping its stack position.</summary>
        /// <param name="screen">Screen being opened.</param>
        /// <param name="show">Callback that presents the screen.</param>
        /// <param name="hide">Callback that hides the screen and completes its close handling.</param>
        /// <param name="pauseMode">Character and clock pause requests owned by this screen.</param>
        /// <param name="character">Character to pause, or the current main character when omitted.</param>
        public void Open(ManagedUIScreen screen, Action show, Action hide,
            ScreenPauseMode pauseMode = ScreenPauseMode.CharacterAndClock, GameCharacter character = null)
        {
            if (!isActiveAndEnabled)
                throw new InvalidOperationException("UrGUIManager must be active to open a screen.");
            if (!screen) throw new ArgumentNullException(nameof(screen));
            if (show == null) throw new ArgumentNullException(nameof(show));
            if (hide == null) throw new ArgumentNullException(nameof(hide));
            _input.ValidateScreenMap(screen.InputActionMap);

            // Reopening updates ownership without duplicating the screen in the stack.
            var wasOpen = _openScreens.TryGetValue(screen, out var previous);
            if (wasOpen) RemovePause(previous);

            // Character-pausing screens default to the main character when no target is supplied.
            var state = new OpenScreenState { Hide = hide, PauseMode = pauseMode,
                Character = (pauseMode & ScreenPauseMode.Character) == 0 ? null :
                    character ? character : MainCharacter.CurrentMainCharacter };
            state.Document = screen.GetComponent<UIDocument>();
            state.OriginalSortingOrder = wasOpen ? previous.OriginalSortingOrder : state.Document ? state.Document.sortingOrder : 0;

            // Register first so presentation callbacks can query open state; Close rolls it back on failure.
            _openScreens[screen] = state;
            if (!wasOpen) _screenOrder.Add(screen);
            try
            {
                ApplyScreenOrder();
                AddPause(state);
                show();
                UpdateInput();
                PlayerInteractionContext.Instance?.Refresh();
            }
            catch { Close(screen, false); throw; }
            if (!wasOpen && IsOpen(screen)) PlaySound(UISoundCue.Open, screen);
        }

        internal void RebindScreen(ManagedUIScreen screen)
        {
            var state = _openScreens[screen];
            var document = screen.GetComponent<UIDocument>();
            if (state.Document != document)
            {
                if (state.Document) state.Document.sortingOrder = state.OriginalSortingOrder;
                state.Document = document;
                state.OriginalSortingOrder = document ? document.sortingOrder : 0;
            }
            ApplyScreenOrder();
            screen.SetInputActive(IsTopScreen(screen));
        }

        /// <summary>Closes a managed screen and releases its pause requests.</summary>
        /// <param name="screen">Screen to close.</param>
        /// <param name="playSound">Whether to play the configured close cue.</param>
        public void Close(ManagedUIScreen screen, bool playSound = true)
        {
            if (screen != null && _openScreens.Remove(screen, out var state))
            {
                RemovePause(state);
                screen.SetInputActive(false);
                _screenOrder.Remove(screen);
                if (state.Document) state.Document.sortingOrder = state.OriginalSortingOrder;
                ApplyScreenOrder();
                state.Hide();
                UpdateInput();
                PlayerInteractionContext.Instance?.Refresh();
                if (playSound) PlaySound(UISoundCue.Close, screen);
            }
        }

        /// <summary>Plays a screen override or shared cue; returns false when no usable sound is configured.</summary>
        /// <param name="cue">Sound cue to play.</param>
        /// <param name="screen">Optional screen whose cue override takes priority.</param>
        public bool PlaySound(UISoundCue cue, ManagedUIScreen screen = null)
        {
            if (!isActiveAndEnabled) return false;
            UISoundProfile.Sound sound = null;
            var overrides = screen ? screen.SoundOverrides : null;
            if (!(overrides && overrides.TryGet(cue, out sound)) &&
                !(soundProfile && soundProfile.TryGet(cue, out sound))) return false;
            if (sound.clips == null || sound.clips.Length == 0 || sound.volume <= 0) return false;
            var clip = sound.clips[UnityEngine.Random.Range(0, sound.clips.Length)];
            var pitch = UnityEngine.Random.Range(sound.pitchRange.x, sound.pitchRange.y);
            var options = MMSoundManagerPlayOptions.Default;
            options.MmSoundManagerTrack = MMSoundManager.MMSoundManagerTracks.UI;
            options.AudioGroup = sound.mixerGroup;
            options.Volume = sound.volume;
            options.Pitch = pitch;
            MMSoundManagerSoundPlayEvent.Trigger(clip, options);
            return true;
        }

        private void UpdateInput()
        {
            var top = _screenOrder.Count == 0 ? null : _screenOrder[^1];
            _input.SetScreenMap(top ? top.InputActionMap : null);
            foreach (var screen in _screenOrder) screen.SetInputActive(screen == top);
        }

        private void ApplyScreenOrder()
        {
            var highest = 0f;
            foreach (var state in _openScreens.Values) highest = Mathf.Max(highest, state.OriginalSortingOrder);
            for (var i = 0; i < _screenOrder.Count; i++)
                if (_openScreens.TryGetValue(_screenOrder[i], out var state) && state.Document)
                    state.Document.sortingOrder = highest + i + 1;
        }

        private void AddPause(OpenScreenState state)
        {
            if ((state.PauseMode & ScreenPauseMode.GameClock) != 0) _clockPauses++;
            if ((state.PauseMode & ScreenPauseMode.Character) == 0 || !state.Character) return;
            _characterPauses.TryGetValue(state.Character, out var count);
            _characterPauses[state.Character] = count + 1;
            state.Character.Controller?.Stop();
            state.Character.SetMovementState(MovementState.Idle);
        }

        private void RemovePause(OpenScreenState state)
        {
            if ((state.PauseMode & ScreenPauseMode.GameClock) != 0) _clockPauses--;
            if ((state.PauseMode & ScreenPauseMode.Character) == 0 || ReferenceEquals(state.Character, null)) return;
            if (!_characterPauses.TryGetValue(state.Character, out var count)) return;
            if (count == 1) _characterPauses.Remove(state.Character);
            else _characterPauses[state.Character] = count - 1;
        }

        /// <summary>Closes every managed screen and releases its pause requests without close sounds.</summary>
        public void CloseAll()
        {
            var screens = new List<OpenScreenState>(_openScreens.Values);
            _openScreens.Clear();
            _screenOrder.Clear();
            _characterPauses.Clear();
            _clockPauses = 0;
            _input.SetScreenMap(null);
            PlayerInteractionContext.Instance?.Refresh();
            foreach (var state in screens)
            {
                if (state.Document) state.Document.sortingOrder = state.OriginalSortingOrder;
                state.Hide();
            }
        }

        /// <summary>Location entry does not open screens; presenters open them when needed.</summary>
        /// <param name="location">Entered location.</param>
        public void OnLocationEnter(LocationData location) { }

        /// <summary>Closes open screens before leaving a location.</summary>
        /// <param name="location">Location being left.</param>
        public void OnLocationLeave(LocationData location) => CloseAll();
    }
}
