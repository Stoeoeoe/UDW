using System;
using Character;
using Core.Events;
using Interaction.Tools.Stamina;
using UnityEngine;
using UnityEngine.UIElements;

namespace UI.Stamina
{
    /// <summary>Displays the main character's stamina and spendable surplus in the shared HUD.</summary>
    [RequireComponent(typeof(UIDocument)), DisallowMultipleComponent, DefaultExecutionOrder(300)]
    public sealed class StaminaHudPresenter : MonoBehaviour, IEventListener<StaminaChangedEvent>, IEventListener<HealthChangedEvent>,
        IEventListener<MainCharacterChangedEvent>
    {
        private ProgressBar _meter;
        private Label _value;
        private VisualElement _root;
        private VisualElement _healthRoot;
        private ProgressBar _healthMeter;
        private Label _healthValue;
        private MainCharacter _character;

        private void OnEnable()
        {
            var document = GetComponent<UIDocument>().rootVisualElement;
            _root = document.Q("staminaHud")
                ?? throw new InvalidOperationException("The HUD requires its staminaHud root.");
            _meter = _root.Q<ProgressBar>("staminaMeter")
                ?? throw new InvalidOperationException("The stamina HUD requires its meter.");
            _value = _root.Q<Label>("staminaValue")
                ?? throw new InvalidOperationException("The stamina HUD requires its value label.");
            _healthRoot = document.Q("healthHud")
                ?? throw new InvalidOperationException("The HUD requires its healthHud root.");
            _healthMeter = _healthRoot.Q<ProgressBar>("healthMeter")
                ?? throw new InvalidOperationException("The health HUD requires its meter.");
            _healthValue = _healthRoot.Q<Label>("healthValue")
                ?? throw new InvalidOperationException("The health HUD requires its value label.");
            _root.Query<VisualElement>().ForEach(element => element.pickingMode = PickingMode.Ignore);
            _healthRoot.Query<VisualElement>().ForEach(element => element.pickingMode = PickingMode.Ignore);
            document.pickingMode = PickingMode.Ignore;
            this.Subscribe<StaminaChangedEvent>();
            this.Subscribe<HealthChangedEvent>();
            this.Subscribe<MainCharacterChangedEvent>();
            Bind(CharacterManager.Instance.MainCharacter);
        }

        private void OnDisable()
        {
            this.Unsubscribe<StaminaChangedEvent>();
            this.Unsubscribe<HealthChangedEvent>();
            this.Unsubscribe<MainCharacterChangedEvent>();
        }

        /// <summary>Tracks player registration; a character can register before its resource state binds.</summary>
        public void OnEvent(MainCharacterChangedEvent change) => Bind(change.MainCharacter);

        private void Bind(MainCharacter character)
        {
            _character = character;
            if (_character && _character.IsRuntimeInitialized)
            {
                Show(_character.Stamina.CurrentStamina, _character.Stamina.MaxStamina);
                ShowHealth(_character.Health.CurrentHealth, _character.Health.MaxHealth);
            }
            else
            {
                // Startup and unregistration have no bound player resource. Initialization publishes the first values.
                _meter.value = 0;
                _value.text = string.Empty;
                _root.RemoveFromClassList("stamina-hud--overcharged");
                _healthMeter.value = 0;
                _healthValue.text = string.Empty;
                _healthRoot.RemoveFromClassList("health-hud--overcharged");
            }
        }

        /// <summary>Updates only for the tracked player; NPC stamina changes do not affect the HUD.</summary>
        public void OnEvent(StaminaChangedEvent change)
        {
            if (change.Character == _character) Show(change.Current, change.Max);
        }

        public void OnEvent(HealthChangedEvent change)
        {
            if (change.Character == _character) ShowHealth(change.Current, change.Max);
        }

        private void ShowHealth(int current, int maximum)
        {
            _healthMeter.value = maximum == 0 ? 0 : Mathf.Clamp01((float)current / maximum) * 100f;
            _healthValue.text = $"{current} / {maximum}";
            _healthRoot.EnableInClassList("health-hud--overcharged", current > maximum);
        }

        private void Show(int current, int maximum)
        {
            // Zero capacity is valid. Surplus is shown numerically and tinted, without extending the meter beyond its track.
            _meter.value = maximum == 0 ? 0 : Mathf.Clamp01((float)current / maximum) * 100f;
            _value.text = $"{current} / {maximum}";
            _root.EnableInClassList("stamina-hud--overcharged", current > maximum);
        }
    }
}
