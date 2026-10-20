using System;
using System.Collections.Generic;
using UnityEngine;

namespace Character.Animations
{
    [CreateAssetMenu(menuName = "Game/Memao Animation Library")]
    public sealed class MemaoAnimationLibrary : ScriptableObject
    {
        [Serializable]
        public struct Entry
        {
            public string name;
            public AnimationClip clip;
        }

        [SerializeField] private List<Entry> clips = new();
        private Dictionary<string, AnimationClip> lookup;

        public bool TryGet(string name, out AnimationClip clip)
        {
            if (lookup == null)
            {
                var validated = new Dictionary<string, AnimationClip>(StringComparer.Ordinal);
                if (clips == null) throw new InvalidOperationException($"Memao library '{this.name}' requires a clip list.");
                foreach (var entry in clips)
                {
                    if (string.IsNullOrWhiteSpace(entry.name) || !entry.clip)
                        throw new InvalidOperationException($"Memao library '{this.name}' contains an invalid clip entry.");
                    if (!validated.TryAdd(entry.name, entry.clip))
                        throw new InvalidOperationException($"Memao library '{this.name}' contains duplicate clip '{entry.name}'.");
                }
                lookup = validated;
            }
            return lookup.TryGetValue(name, out clip);
        }

        public static string DirectionalName(string action, Vector2 facing)
        {
            if (string.IsNullOrWhiteSpace(action)) throw new ArgumentException("A Memao action name is required.", nameof(action));
            string direction = facing == Vector2.zero ? "D"
                : Mathf.Abs(facing.x) >= Mathf.Abs(facing.y) ? (facing.x >= 0 ? "R" : "L")
                : facing.y >= 0 ? "U" : "D";
            return action + "_" + direction;
        }

        public AnimationClip GetDirectional(string action, Vector2 facing)
        {
            string key = DirectionalName(action, facing);
            if (!TryGet(key, out var clip))
                throw new InvalidOperationException($"Memao library '{name}' is missing required clip '{key}'.");
            return clip;
        }

        /// <summary>Required actions must support every cardinal facing; optional named actions can use TryGet.</summary>
        public void ValidateAction(string action, bool oneShot = false)
        {
            if (string.IsNullOrWhiteSpace(action))
                throw new InvalidOperationException($"Memao library '{name}' requires an action name.");
            foreach (var facing in new[] { Vector2.down, Vector2.up, Vector2.left, Vector2.right })
            {
                var clip = GetDirectional(action, facing);
                if (oneShot && (clip.isLooping || clip.length <= 0f))
                    throw new InvalidOperationException($"Memao action '{action}' in '{name}' requires finite, non-looping clips.");
            }
        }

        public void ValidateOneShotAction(string action)
        {
            bool found = false;
            foreach (var facing in new[] { Vector2.down, Vector2.up, Vector2.left, Vector2.right })
            {
                // Partial actions, such as Paint, are intentionally supported only in their authored directions.
                if (!TryGet(DirectionalName(action, facing), out var clip)) continue;
                found = true;
                if (clip.isLooping || clip.length <= 0f)
                    throw new InvalidOperationException($"Memao action '{action}' in '{name}' requires finite, non-looping clips.");
            }
            if (!found) throw new InvalidOperationException($"Memao library '{name}' has no clips for action '{action}'.");
        }

        private void OnEnable() => lookup = null;
        private void OnValidate() => lookup = null;

#if UNITY_EDITOR
        public void SetClips(List<Entry> newClips)
        {
            clips = newClips;
            lookup = null;
        }
#endif
    }
}
