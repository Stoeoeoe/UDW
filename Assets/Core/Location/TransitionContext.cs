using UnityEngine;

namespace Core.Location
{
    /// <summary>
    /// ScriptableObject that carries transition data across a scene load.
    /// Survives without DontDestroyOnLoad because it's an asset, not a scene object.
    /// Set before loading; cleared by LevelManager once the player has been spawned.
    /// </summary>
    [CreateAssetMenu(fileName = "TransitionContext", menuName = "Game/TransitionContext")]
    public class TransitionContext : ScriptableObject
    {
        public string  TargetEntryKey;
        public Vector2 FacingDirection;

        public bool HasTarget => !string.IsNullOrEmpty(TargetEntryKey);

        public void Set(string entryKey, Vector2 facingDirection)
        {
            TargetEntryKey = entryKey;
            FacingDirection = facingDirection;
        }

        public void Clear()
        {
            TargetEntryKey  = null;
            FacingDirection = Vector2.down;
        }
    }
}
