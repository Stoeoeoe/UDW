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
        [SerializeField] float walkSpeed = 4f;
        [SerializeField] float runSpeed  = 7f;

        [Header("Footsteps")]
        [SerializeField] float baseFootstepInterval = 0.4f;
        [SerializeField] float footstepVolume = 0.5f;
        [SerializeField] float pitchMin = 0.8f;
        [SerializeField] float pitchMax = 1.2f;

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
            float speed = run ? runSpeed : walkSpeed;

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
                    var terrain = Character.CurrentTileData?.TerrainData;
                    var sound   = state == MovementState.Walking
                        ? terrain?.SurfaceSound.walkSound
                        : terrain?.SurfaceSound.runSound;

                    float pitch = Random.Range(pitchMin, pitchMax);
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
