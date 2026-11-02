using Core.Common;
using Core.Scripting;
using UnityEngine;

namespace Character.Animations
{
    [CreateAssetMenu(menuName = "Game/Character/Emote")]
    public sealed class EmoteDefinition : ValidatedScriptableObject<EmoteValidator>
    {
        [SerializeField, Validation.NamespacedId(Lowercase = true)] private string emoteId;
        [SerializeField, Tooltip("Default duration in scaled seconds; a sequence may override this for an individual play.")]
        [Validation.Finite, Validation.Min(float.Epsilon)] private float duration = 1f;
        [SerializeField, Tooltip("Animation speed multiplier: 1 is normal speed, 0.5 is half speed. Duration is configured separately.")]
        [Validation.Finite, Validation.Min(float.Epsilon)] private float playbackSpeed = 0.5f;
        [SerializeField] private CharacterAnimation animation;
        [SerializeField, Tooltip("Optional sound played once when the emote starts.")] private SoundDefinition sound;
        [SerializeField] private Sprite calloutIcon;
        [SerializeField] private Vector2 calloutOffset = new(0f, 2f);

        public string Id => emoteId;
        public float Duration => duration;
        public float PlaybackSpeed => playbackSpeed;
        public CharacterAnimation Animation => animation;
        public SoundDefinition Sound => sound;
        public Sprite CalloutIcon => calloutIcon;
        public Vector2 CalloutOffset => calloutOffset;
    }
}
