using Input;
using MoreMountains.Tools;
using UnityEngine;

namespace Character.Abilities
{
    /// <summary>
    /// Reads move input, drives Controller2D and Orientation2D, sets character movement state,
    /// and plays footstep sounds.
    /// </summary>
    public class MovementAbility : CharacterAbility
    {
        [Header("Footsteps")]
        [SerializeField] float baseFootstepInterval = 0.4f;
        [SerializeField] float footstepVolume = 0.5f;

        float _footstepTimer;
        float _nextFootstepTime;

        public override void Tick()
        {
            if (!AbilityAuthorized)
            {
                Controller.Stop();
                return;
            }

            var input   = InputManager.Instance.Move;
            bool run    = InputManager.Instance.RunHeld;
            float speed = run ? Character.Attributes.RunSpeed : Character.Attributes.WalkSpeed;

            Controller.SetMovementInput(input, speed);
            Orientation.UpdateFromVelocity(Controller.CurrentVelocity);

            bool moving = input.sqrMagnitude > 0.01f;
            var state = !moving ? MovementState.Idle
                      : run     ? MovementState.Running
                                : MovementState.Walking;
            Character.SetMovementState(state);

            HandleFootsteps(state);
        }

        void HandleFootsteps(MovementState state)
        {
            if (state is MovementState.Walking or MovementState.Running)
            {
                if (_footstepTimer >= _nextFootstepTime)
                {
                    var surfaceSound = Character.Tiles.Current?.TerrainData?.SurfaceSound;
                    var sound   = state == MovementState.Walking
                        ? surfaceSound?.walkSound
                        : surfaceSound?.runSound;

                    float pitch = surfaceSound != null
                        ? Random.Range(Mathf.Min(surfaceSound.minPitch, surfaceSound.maxPitch), Mathf.Max(surfaceSound.minPitch, surfaceSound.maxPitch))
                        : 1f;
                    MMSoundManagerSoundPlayEvent.Trigger(sound, MMSoundManager.MMSoundManagerTracks.Sfx,
                        transform.position, false, pitch: pitch, volume: footstepVolume);

                    _footstepTimer    = 0f;
                    _nextFootstepTime = baseFootstepInterval * (4f / Mathf.Max(1f, Controller.CurrentVelocity.magnitude));
                }
                else
                {
                    _footstepTimer += Time.deltaTime;
                }
            }
            else
            {
                _footstepTimer    = 0f;
                _nextFootstepTime = 0f;
            }
        }
    }
}
