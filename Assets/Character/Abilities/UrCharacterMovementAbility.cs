using Character;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;

public class UrCharacterMovementAbility : CharacterMovement
{
    [SerializeField] public float baseFootstepInterval = 0.4f; // Base interval in seconds for a speed of 400
    [SerializeField] public float footstepVolume = 0.5f;
    [SerializeField] public float pitchMin = 0.8f;
    [SerializeField] public float pitchMax = 1.2f;

    private float _currentFootstepTime = 0.0f;
    private float _nextFootstepTime = 0.0f;
    private UrCharacter _currentCharacter;

    protected override void Awake()
    {
        base.Awake();
        this._currentCharacter = (_character as UrCharacter);
    }

    protected override void HandleMovement()
    {
        base.HandleMovement();
        // Play sound effect if walking. If the last sound effect was played less than x seconds ago, do not play again.
        // Get the time between footsteps based on the character's speed.
        // Once we calculated the time until the next footstep, it's not modified.
        var movementState = _movement.CurrentState;
        if (movementState is CharacterStates.MovementStates.Walking or CharacterStates.MovementStates.Running)
        {
            // Play and reset
            if (_currentFootstepTime >= _nextFootstepTime)
            {
                float pitch = Random.Range(pitchMin, pitchMax);
                AudioClip sound;
                if (movementState == CharacterStates.MovementStates.Walking)
                    sound = _currentCharacter?.CurrentTileData?.TerrainData.SurfaceSound.walkSound;
                else sound = _currentCharacter?.CurrentTileData?.TerrainData.SurfaceSound.runSound;

                MMSoundManagerSoundPlayEvent.Trigger(sound, MMSoundManager.MMSoundManagerTracks.Sfx,
                    this.transform.position, false, pitch: pitch, volume: footstepVolume);
                _currentFootstepTime = 0.0f;
                _nextFootstepTime = baseFootstepInterval * (4.0f / Mathf.Max(1.0f, _movementSpeed));
            }
            else
            {
                _currentFootstepTime += Time.deltaTime;
            }
        }
        else
        {
            // Reset when stop walking
            _currentFootstepTime = 0.0f;
            _nextFootstepTime = 0.0f;
        }
    }
}