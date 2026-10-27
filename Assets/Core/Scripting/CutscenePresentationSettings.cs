using System.Collections.Generic;
using Core.Common;
using UnityEngine;

namespace Core.Scripting
{
    [CreateAssetMenu(menuName = "Cutscenes/Presentation Settings")]
    public sealed class CutscenePresentationSettings : ValidatedScriptableObject
    {
        public const string ResourceName = "CutscenePresentation";
        [SerializeField, Min(0)] private float fadeSeconds = 0.3f;
        [SerializeField, Min(0)] private float holdSeconds = 1.7f;
        [SerializeField, Min(0)] private float revealSeconds = 0.12f;
        public float FadeSeconds => fadeSeconds;
        public float HoldSeconds => holdSeconds;
        public float RevealSeconds => revealSeconds;

        public override IReadOnlyList<ConfigurationError> ValidateConfiguration()
        {
            var errors = new List<ConfigurationError>();
            Check(fadeSeconds, nameof(fadeSeconds));
            Check(holdSeconds, nameof(holdSeconds));
            Check(revealSeconds, nameof(revealSeconds));
            return errors;

            void Check(float value, string setting)
            {
                if (!float.IsFinite(value) || value < 0)
                    errors.Add(new ConfigurationError(this, setting, "Requires finite, nonnegative seconds."));
            }
        }
    }
}
