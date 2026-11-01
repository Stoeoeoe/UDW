using System;
using MoreMountains.Tools;
using UnityEngine;
using UnityEngine.Audio;

namespace Core.Music
{
    [DefaultExecutionOrder(100)]
    public sealed class MusicDirector : Singleton<MusicDirector>
    {
        // SystemRoot exists by the end of scene Awake; requests begin in Start.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void AttachToSystemRoot()
        {
            if (!Instance) SystemRoot.Instance.gameObject.AddComponent<MusicDirector>();
        }

        public readonly MusicRequestResolver Requests = new();
        private MusicPlaybackEngine _playback;
        private double _lead;
        public int GroupCount => _playback?.GroupCount ?? 0;
        public string CurrentCue => _playback?.CurrentCue;
        public string IncomingCue => _playback?.IncomingCue;
        public double Beat => _playback?.Beat(AudioSettings.dspTime) ?? 0;
        public double TransitionDspTime => _playback?.TransitionDspTime ?? 0;

        protected override void OnAwake()
        {
            _playback = new MusicPlaybackEngine(transform, MMSoundManager.Current.settingsSo.MusicAudioMixerGroup);
            AudioSettings.GetDSPBufferSize(out var size, out var buffers);
            _lead = Math.Max(0.1, (double)size * buffers / AudioSettings.outputSampleRate * 2);
            AudioSettings.OnAudioConfigurationChanged += OnAudioConfigurationChanged;
        }
        private void Update() => _playback.Tick(AudioSettings.dspTime, _lead, Requests.Winner);
        private void OnAudioConfigurationChanged(bool deviceChanged)
        {
            // Device resets invalidate scheduled timestamps. Rebuild from current requests at a new epoch.
            _playback.Dispose();
            AudioSettings.GetDSPBufferSize(out var size, out var buffers);
            _lead = Math.Max(0.1, (double)size * buffers / AudioSettings.outputSampleRate * 2);
        }
        public void SetUserVolume(float volume)
        {
            if (!float.IsFinite(volume) || volume < 0 || volume > 1) throw new ArgumentOutOfRangeException(nameof(volume));
            MMSoundManager.Current.SetVolumeMusic(volume);
        }
        protected override void OnDestroy()
        {
            AudioSettings.OnAudioConfigurationChanged -= OnAudioConfigurationChanged;
            _playback.Dispose(); Requests.Clear();
            base.OnDestroy();
        }
    }
}
