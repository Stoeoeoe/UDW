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
    public sealed class StaminaHudPresenter : MonoBehaviour, IEventListener<StaminaChangedEvent>,
        IEventListener<MainCharacterChangedEvent>
    {
        private ProgressBar _meter;
        private Label _value;
        private VisualElement _root;
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
            _root.Query<VisualElement>().ForEach(element => element.pickingMode = PickingMode.Ignore);
            document.pickingMode = PickingMode.Ignore;
            this.Subscribe<StaminaChangedEvent>();
            this.Subscribe<MainCharacterChangedEvent>();
            Bind(CharacterManager.Instance.MainCharacter);
        }

        private void OnDisable()
        {
            this.Unsubscribe<StaminaChangedEvent>();
            this.Unsubscribe<MainCharacterChangedEvent>();
        }

        /// <summary>Tracks player registration; a character can register before its resource state binds.</summary>
        public void OnEvent(MainCharacterChangedEvent change) => Bind(change.MainCharacter);

        private void Bind(MainCharacter character)
        {
            _character = character;
            if (_character && _character.IsRuntimeInitialized)
                Show(_character.Stamina.CurrentStamina, _character.Stamina.MaxStamina);
            else
            {
                // Startup and unregistration have no bound player resource. Initialization publishes the first values.
                _meter.value = 0;
                _value.text = string.Empty;
                _root.RemoveFromClassList("stamina-hud--overcharged");
            }
        }

        /// <summary>Updates only for the tracked player; NPC stamina changes do not affect the HUD.</summary>
        public void OnEvent(StaminaChangedEvent change)
        {
            if (change.Character == _character) Show(change.Current, change.Max);
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
