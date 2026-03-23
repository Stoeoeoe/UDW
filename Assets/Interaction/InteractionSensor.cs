using System;
using Character;
using SensorToolkit;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Interaction
{
    /// <summary>
    /// Detects nearby interactables using a single stationary RangeSensor2D.
    /// Interactables that require a button press are additionally filtered by facing direction.
    /// Results are cached; InteractableChangedEvent fires only on actual change.
    /// </summary>
    public class InteractionSensor : MonoBehaviour
    {
        [SerializeField] private RangeSensor2D ambientSensor;
        [SerializeField] private TriggerSensor2D triggerSensor;

        private GameCharacter _owner;
        private bool _dirty;

        [ReadOnly] [ShowInInspector] public AbstractInteractable Current { get; private set; }

        private void Awake()
        {
            _owner = GetComponentInParent<GameCharacter>();
            ambientSensor.OnDetected.AddListener((_, __) => _dirty = true);
            ambientSensor.OnLostDetection.AddListener((_, __) => _dirty = true);
            triggerSensor.OnDetected.AddListener((_, __) => _dirty = true);
            triggerSensor.OnLostDetection.AddListener((_, __) => _dirty = true);
        }

        private void Start()
        {
            _owner.Orientation.OnFacingDirectionChanged += RotateSensors;
            RotateSensors(MainCharacter.CurrentMainCharacter.Orientation.FacingDirection);
        }

        private void RotateSensors(Vector2 characterOrientation)
        {
            // Rotate the trigger sensor to match the character's facing direction, so it only detects interactables in front of the character.
            var angle = Mathf.Atan2(characterOrientation.y, characterOrientation.x) * Mathf.Rad2Deg;
            triggerSensor.transform.localRotation = Quaternion.Euler(0, 0, angle + 90f);
            
            triggerSensor.Pulse();
            _dirty = true;
        }

        private void LateUpdate()
        {
            if (!_dirty) return;
            _dirty = false;
            Refresh();
        }

        void Refresh()
        {
            var next = FindBest();
            if (next == Current) return;
            Current = next;
            InteractableChangedEvent.Trigger(Current, _owner);
        }

        private AbstractInteractable FindBest()
        {
            // Things in the front over ambient
            for (var i = 0; i < triggerSensor.DetectedObjectsOrderedByDistance.Count; i++)
            {
                var go = triggerSensor.DetectedObjectsOrderedByDistance[i];
                if (!go.TryGetComponent<AbstractInteractable>(out var ia) || !ia.CanInteract) continue;
                return ia;
            }

            // Ambient interactables
            foreach (var go in ambientSensor.DetectedObjectsOrderedByDistance)
            {
                if (!go.TryGetComponent<AbstractInteractable>(out var ia) || !ia.CanInteract) continue;
                if (ia.RequiresButtonPress) continue;
                return ia;
            }

            return null;
        }
    }
}