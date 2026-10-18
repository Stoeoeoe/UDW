using System;
using Core.Events;
using Core.Game;
using Core.TimeAndWeather;
using UnityEngine;
using UnityEngine.UIElements;

namespace UI.Clock
{
    /// <summary>Displays the game clock and seasonal date without intercepting gameplay input.</summary>
    [RequireComponent(typeof(UIDocument)), DisallowMultipleComponent, DefaultExecutionOrder(300)]
    public sealed class ClockHudPresenter : MonoBehaviour, IEventListener<GameTimeChangedEvent>
    {
        private Label _time, _date;

        private void OnEnable()
        {
            var root = GetComponent<UIDocument>().rootVisualElement;
            _time = root.Q<Label>("clockTime")
                ?? throw new InvalidOperationException("Clock HUD requires its clockTime label.");
            _date = root.Q<Label>("clockDate")
                ?? throw new InvalidOperationException("Clock HUD requires its clockDate label.");
            root.pickingMode = PickingMode.Ignore;
            this.Subscribe<GameTimeChangedEvent>();
            Refresh();
        }

        // The calendar establishes a new game's starting date during Start.
        private void Start() => Refresh();
        private void OnDisable() => this.Unsubscribe<GameTimeChangedEvent>();

        /// <summary>Refreshes after clock ticks and overnight calendar changes.</summary>
        public void OnEvent(GameTimeChangedEvent change) => Refresh();

        private void Refresh()
        {
            var time = GameState.Time;
            _time.text = $"{time.hour:00}:{time.minute:00}";
            _date.text = $"{time.season} · Day {time.dayOfSeason}";
        }
    }
}
