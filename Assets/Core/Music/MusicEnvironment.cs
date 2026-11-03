using VContainer;
using UnityEngine;

namespace Core.Music
{
    /// <summary>Scene-owned environmental selection; loading a location reconstructs music from its authored context.</summary>
    public sealed class MusicEnvironment : MonoBehaviour
    {
        [Inject] private MusicDirector _musicDirector;

        [Tooltip("An arrangement of a theme. Maps can select different cues with the same theme.")]
        public MusicCue cue;
        [Tooltip("The cue's named stem-volume mix for this location.")]
        public string preset;
        public int priority;
        [Min(0)] public float fadeSeconds = 1;
        private MusicRequestResolver.Handle _request;
        private void Start() { if (isActiveAndEnabled) Acquire(); }
        private void OnEnable() { if (didStart) Acquire(); }
        private void Acquire()
        {
            cue.RequireValidConfiguration();
            _request = _musicDirector.Requests.Request(cue, preset, priority, MusicQuantization.Immediate, fadeSeconds);
        }
        public void SetPreset(string mix)
        {
            cue.Preset(mix); preset = mix;
            _request?.Update(cue, preset, MusicQuantization.Immediate, fadeSeconds);
        }
        private void OnDisable() { _request?.Dispose(); _request = null; }
    }
}
