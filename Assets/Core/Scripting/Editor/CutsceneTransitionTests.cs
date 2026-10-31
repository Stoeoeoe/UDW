using NUnit.Framework;
using UnityEngine;

namespace Core.Scripting.Editor
{
    public sealed class CutsceneTransitionTests
    {
        [TestCase(-1f)]
        [TestCase(float.NaN)]
        [TestCase(float.PositiveInfinity)]
        public void GlobalSettingsRejectInvalidTimingsBeforePlayback(float value)
        {
            var settings = ScriptableObject.CreateInstance<CutscenePresentationSettings>();
            try
            {
                foreach (var field in new[] { "fadeSeconds", "holdSeconds", "revealSeconds" })
                {
                    var timing = typeof(CutscenePresentationSettings).GetField(field,
                        System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic);
                    timing.SetValue(settings, value);
                    Assert.That(settings.ValidateConfiguration(), Is.Not.Empty, field);
                    Assert.That(() => settings.RequireValidConfiguration(), Throws.ArgumentException);
                    timing.SetValue(settings, 0f);
                }
            }
            finally { Object.DestroyImmediate(settings); }
        }
    }
}
