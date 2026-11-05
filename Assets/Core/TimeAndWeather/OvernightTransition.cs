using System;
using System.Collections;
using System.IO;
using Character;
using Core.Events;
using Core.Game;
using Core.Location;
using UI.Shared;
using UnityEngine;
using VContainer;

namespace Core.TimeAndWeather
{
    /// <summary>
    /// Plays the overnight sequence: cover the scene, move the player home, advance the calendar behind black and reveal
    /// the morning. Clock progression itself belongs to <see cref="GameClock"/>.
    /// </summary>
    public sealed class OvernightTransition : GameManager
    {
        [Inject] private GameClock _clock;
        [Inject] private LevelManager _levelManager;
        [Inject] private CharacterManager _characterManager;
        [Inject] private UrGUIManager _urGUIManager;
        [Inject] private GameStateManager _game;

        [Header("Day transition")]
        [SerializeField, Min(0f)] private float dayBlackoutDuration = 0.6f;
        [Tooltip("Optional sound played while the screen is covered.")]
        [SerializeField] private AudioClip newDayJingle;

        private IEnumerator _routine;

        public bool IsRunning => _routine != null;

        protected override void OnEnable()
        {
            base.OnEnable();
            _clock.BedtimeReached += OnBedtime;
        }

        protected override void OnDisable()
        {
            _clock.BedtimeReached -= OnBedtime;
            base.OnDisable();
            Cancel();
        }

        private void OnBedtime() => EndDay(DayEndReason.PassedOut);

        /// <summary>Fades through the next morning, stopping the clock and player controls during the transition.</summary>
        public void EndDay(DayEndReason reason = DayEndReason.Sleep)
        {
            if (IsRunning || !_levelManager.SceneReady) return;
            var character = _characterManager.MainCharacter;
            if (!character)
                throw new InvalidOperationException("Ending the day requires a registered main character.");
            _routine = Run(character, reason, _clock.CurrentTime.Hour);
            StartCoroutine(_routine);
        }

        private IEnumerator Run(MainCharacter character, DayEndReason reason, int bedtimeHour)
        {
            var gui = _urGUIManager;
            _clock.BeginOvernight();
            try
            {
                gui.TransitionInterrupted += Cancel;
                EventBus<DayTransitionStarted>.Raise(new DayTransitionStarted(character));
                try
                {
                    if (reason == DayEndReason.PassedOut)
                        yield return character.Animator.PlayInteractionAnimation(character.PassOutAnimation);
                    yield return gui.CoverScene(character.transform);
                }
                finally { character.Animator.EndInteractionAnimation(); }
                yield return _levelManager.ReturnHome(character);
                // NewDayEvent listeners run only after the screen is completely covered.
                _clock.StartNewDay();
                // Recovery follows clock-driven expirations and only occurs once the overnight advance succeeds.
                EventBus<OvernightRestCompleted>.Raise(new OvernightRestCompleted(character, reason, bedtimeHour));
                AutoSave();
                yield return gui.RevealScene(character.transform, dayBlackoutDuration, newDayJingle);
            }
            finally
            {
                try
                {
                    gui.TransitionInterrupted -= Cancel;
                    gui.ResetTransition();
                    EventBus<DayTransitionFinished>.Raise(new DayTransitionFinished(character));
                }
                finally
                {
                    _routine = null;
                    _clock.EndOvernight();
                }
            }
        }

        // The new morning, with the player in bed behind the cover, is the clean save point. A session without a
        // slot (such as a development start) has nowhere to save; a failed write must not break the day transition.
        private void AutoSave()
        {
            if (_game.CurrentSlot == null) return;
            try { _game.Save(); }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
                Debug.LogError($"Autosave to slot '{_game.CurrentSlot}' failed: {error.Message}");
            }
        }

        /// <summary>Cancels the overnight sequence and releases its listeners' transition state.</summary>
        public void Cancel()
        {
            if (_routine == null) return;
            var routine = _routine;
            StopCoroutine(routine);
            // Stop scheduling first, then dispose this compiler-generated iterator to run its pending finally.
            // Stopping a Unity coroutine alone is not a cleanup contract for its suspended iterator.
            ((IDisposable)routine).Dispose();
        }
    }
}
