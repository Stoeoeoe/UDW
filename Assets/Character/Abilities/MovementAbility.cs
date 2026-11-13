using Input;
using MoreMountains.Tools;
using UnityEngine;
using VContainer;

namespace Character.Abilities
{
    /// <summary>
    /// Reads move input, drives Controller2D and Orientation2D, sets character movement state,
    /// and plays footstep sounds.
    /// </summary>
    public class MovementAbility : CharacterAbility
    {
        [Inject] private InputManager _inputManager;

        [Header("Footsteps")]
        [Tooltip("World units travelled between footsteps.")]
        [SerializeField] float strideLength = 1.6f;
        [SerializeField] float footstepVolume = 0.5f;

        float _strideDistance;
        Vector2 _lastPosition;
        bool _wasMoving;

        public override void Tick()
        {
            // An action such as cutscene walking supplies movement and facing while it owns the controller.
            if (Controller.IsMovementOwned) return;

            if (!AbilityAuthorized)
            {
                Controller.Stop();
                return;
            }

            var input   = _inputManager.Move;
            bool run    = _inputManager.RunHeld;
            float speed = run ? Character.Attributes.RunSpeed : Character.Attributes.WalkSpeed;

            Controller.SetMovementInput(input, speed);
            Orientation.UpdateFromInput(input);

            bool moving = input.sqrMagnitude > 0.01f;
            var state = !moving ? MovementState.Idle
                      : run     ? MovementState.Running
                                : MovementState.Walking;
            Character.SetMovementState(state);

            HandleFootsteps(state);
        }

        // Steps are paced by distance actually travelled, so they follow speed ramps and stop against walls.
        void HandleFootsteps(MovementState state)
        {
            var position = (Vector2)transform.position;
            bool moving = state is MovementState.Walking or MovementState.Running;
            bool wasMoving = _wasMoving;
            _wasMoving = moving;
            if (!moving)
            {
                _strideDistance = 0f;
                _lastPosition = position;
                return;
            }

            // First step lands half a stride after starting to move, not instantly.
            if (!wasMoving) _strideDistance = strideLength * 0.5f;
            _strideDistance += Vector2.Distance(position, _lastPosition);
            _lastPosition = position;
            if (_strideDistance < strideLength) return;
            _strideDistance -= strideLength;

            var surfaceSound = Character.Tiles.Current?.TerrainData?.SurfaceSound;
            var sound = state == MovementState.Walking ? surfaceSound?.walkSound : surfaceSound?.runSound;
            if (sound == null) return; // Surfaces without a clip are silent.

            float pitch = Random.Range(Mathf.Min(surfaceSound.minPitch, surfaceSound.maxPitch),
                                       Mathf.Max(surfaceSound.minPitch, surfaceSound.maxPitch));
            MMSoundManagerSoundPlayEvent.Trigger(sound, MMSoundManager.MMSoundManagerTracks.Sfx,
                transform.position, false, pitch: pitch, volume: footstepVolume);
        }
    }
}
