using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Audio;

namespace Core.Music
{
    /// <summary>Plays one theme continuously, or crossfades between unrelated themes.</summary>
    public sealed class MusicPlaybackEngine : IDisposable
    {
        private readonly Transform _parent;
        private readonly AudioMixerGroup _bus;
        private Group _current, _incoming;
        private double _transitionStart, _transitionEnd;
        private bool _transitioning;
        public int GroupCount => (_current == null ? 0 : 1) + (_incoming == null ? 0 : 1);
        public string CurrentCue => _current?.Cue.id;
        public string IncomingCue => _incoming?.Cue.id;
        public double TransitionDspTime => _transitioning ? _transitionStart : 0;
        public double Beat(double now) => _current?.Transport.BeatAt(now) ?? 0;

        public MusicPlaybackEngine(Transform parent, AudioMixerGroup bus)
        { _parent = parent; _bus = bus ? bus : throw new ArgumentNullException(nameof(bus)); }

        public void Tick(double now, double schedulingLead, MusicRequestResolver.Handle desired)
        {
            if (_transitioning)
            {
                // A departing scene can release its request before the next scene starts.
                // Keep the running theme when the next scene selects an arrangement of it.
                if (_incoming == null && desired != null && _current != null && _current.Cue.Theme == desired.Cue.Theme)
                {
                    var progress = _transitionEnd <= _transitionStart ? (now >= _transitionStart ? 1f : 0f)
                        : Mathf.Clamp01((float)((now - _transitionStart) / (_transitionEnd - _transitionStart)));
                    _current.SetEnvelope(1 - progress);
                    _current.RestoreEnvelope(now, desired.FadeSeconds);
                    _transitioning = false;
                }
                else if (now < _transitionStart && !Matches(_incoming, desired))
                {
                    _incoming?.Dispose(); _incoming = null; _transitioning = false;
                    _current?.SetEnvelope(1);
                }
                else
                {
                    var progress = _transitionEnd <= _transitionStart ? (now >= _transitionStart ? 1f : 0f)
                        : Mathf.Clamp01((float)((now - _transitionStart) / (_transitionEnd - _transitionStart)));
                    _current?.SetEnvelope(1 - progress);
                    _incoming?.SetEnvelope(progress);
                    if (now >= _transitionEnd)
                    {
                        _current?.Dispose(); _current = _incoming; _incoming = null; _transitioning = false;
                    }
                }
            }
            if (!_transitioning)
            {
                if (_current != null && desired != null && _current.Cue.Theme == desired.Cue.Theme)
                {
                    var start = _current.Cue == desired.Cue ? now
                        : _current.Transport.Boundary(now + schedulingLead, desired.Quantization);
                    _current.Mix(desired.Cue, desired.Preset, now, start, desired.FadeSeconds);
                }
                else if (!Matches(_current, desired))
                {
                    _transitionStart = _current == null ? now + schedulingLead
                        : _current.Transport.Boundary(now + schedulingLead, desired?.Quantization ?? MusicQuantization.Immediate);
                    _transitionEnd = _transitionStart + (desired?.FadeSeconds ?? 1);
                    _incoming = desired == null ? null : new Group(_parent, _bus, desired.Cue, desired.Preset, _transitionStart);
                    _incoming?.SetEnvelope(0);
                    _transitioning = true;
                }
            }
            if (_incoming != null && desired != null && _incoming.Cue == desired.Cue)
                _incoming.Mix(desired.Cue, desired.Preset, now, now, desired.FadeSeconds);
            _current?.Tick(now); _incoming?.Tick(now);
        }

        private static bool Matches(Group group, MusicRequestResolver.Handle desired) =>
            group == null ? desired == null : desired != null && group.Cue == desired.Cue;

        public void Dispose()
        {
            _current?.Dispose(); _incoming?.Dispose();
            _current = _incoming = null; _transitioning = false;
        }

        private sealed class Group : IDisposable
        {
            private sealed class Voice
            {
                public AudioSource source;
                public float gain, from, target;
            }

            public MusicCue Cue { get; private set; }
            public readonly MusicTransport Transport;
            private readonly GameObject _root;
            private readonly AudioMixerGroup _bus;
            private readonly Dictionary<(AudioClip, int), Voice> _voices = new();
            private string _preset;
            private double _mixStart, _mixDuration;
            private bool _crossfadingArrangements;
            private float _envelope = 1, _envelopeFrom;
            private double _envelopeStart, _envelopeDuration;
            private bool _restoringEnvelope;

            public Group(Transform parent, AudioMixerGroup bus, MusicCue cue, string preset, double start)
            {
                Transport = new MusicTransport(start, cue.bpm, cue.beatsPerBar);
                _root = new GameObject("Music: " + cue.Theme); _root.transform.SetParent(parent, false);
                _bus = bus;
                try { Mix(cue, preset, start, start, 0); }
                catch { Dispose(); throw; }
            }

            public void SetEnvelope(float gain) { _envelope = gain; _restoringEnvelope = false; }
            public void RestoreEnvelope(double now, double seconds)
            {
                _envelopeFrom = _envelope; _envelopeStart = now; _envelopeDuration = seconds;
                _restoringEnvelope = true;
            }

            public void Mix(MusicCue cue, string preset, double now, double start, double seconds)
            {
                if (Cue == cue && _preset == preset) return;
                Tick(now);
                if (Cue && (Cue.bpm != cue.bpm || Cue.beatsPerBar != cue.beatsPerBar || Cue.loopBars != cue.loopBars ||
                    Cue.stems[0].clip.frequency != cue.stems[0].clip.frequency || Cue.stems[0].clip.samples != cue.stems[0].clip.samples))
                    throw new InvalidOperationException($"Music theme '{cue.Theme}' has incompatible arrangement timing.");
                foreach (var voice in _voices.Values) { voice.from = voice.gain; voice.target = 0; }
                var mix = cue.Preset(preset);
                var occurrences = new Dictionary<AudioClip, int>();
                foreach (var stem in cue.stems)
                {
                    occurrences.TryGetValue(stem.clip, out var occurrence);
                    occurrences[stem.clip] = occurrence + 1;
                    var key = (stem.clip, occurrence);
                    if (!_voices.TryGetValue(key, out var voice))
                    {
                        if (stem.clip.loadState != AudioDataLoadState.Loaded)
                            throw new InvalidOperationException($"Music stem '{stem.clip.name}' must be preloaded before requesting its cue.");
                        var source = _root.AddComponent<AudioSource>();
                        source.playOnAwake = false; source.loop = true; source.pitch = 1;
                        source.spatialBlend = 0; source.dopplerLevel = 0; source.priority = 0;
                        source.outputAudioMixerGroup = _bus; source.clip = stem.clip; source.volume = 0;
                        var frames = (long)Math.Round((start - Transport.Epoch) * stem.clip.frequency);
                        source.timeSamples = (int)(frames % stem.clip.samples);
                        source.PlayScheduled(start);
                        _voices.Add(key, voice = new Voice { source = source });
                    }
                    voice.target = mix.Gain(stem.id);
                }
                _crossfadingArrangements = Cue && Cue != cue;
                Cue = cue; _preset = preset; _mixStart = start; _mixDuration = seconds;
            }

            public void Tick(double now)
            {
                if (_restoringEnvelope)
                {
                    var progress = _envelopeDuration == 0 ? 1 : Mathf.Clamp01((float)((now - _envelopeStart) / _envelopeDuration));
                    _envelope = Mathf.Lerp(_envelopeFrom, 1, progress);
                    if (progress >= 1) _restoringEnvelope = false;
                }
                var t = now < _mixStart ? 0 : _mixDuration == 0 ? 1 : Mathf.Clamp01((float)((now - _mixStart) / _mixDuration));
                foreach (var voice in _voices.Values)
                {
                    // Related arrangements overlap at equal power, avoiding a quiet midpoint.
                    voice.gain = _crossfadingArrangements
                        ? Mathf.Sqrt(Mathf.Lerp(voice.from * voice.from, voice.target * voice.target, t))
                        : Mathf.Lerp(voice.from, voice.target, t);
                    voice.source.volume = voice.gain * _envelope;
                }
            }

            public void Dispose()
            {
                foreach (var voice in _voices.Values) voice.source.Stop();
                if (Application.isPlaying) UnityEngine.Object.Destroy(_root);
                else UnityEngine.Object.DestroyImmediate(_root);
            }
        }
    }
}
