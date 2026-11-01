using System;
using System.Collections.Generic;

namespace Core.Music
{
    /// <summary>Highest priority wins; most recently submitted/updated wins ties. Handles own only their request.</summary>
    public sealed class MusicRequestResolver
    {
        private readonly List<Handle> _requests = new();
        private long _serial;
        public int Count => _requests.Count;
        public Handle Winner
        {
            get
            {
                Handle best = null;
                foreach (var request in _requests)
                    if (best == null || request.Priority > best.Priority || request.Priority == best.Priority && request.Serial > best.Serial)
                        best = request;
                return best;
            }
        }
        public Handle Request(MusicCue cue, string preset, int priority = 0,
            MusicQuantization quantization = MusicQuantization.NextBar, double fadeSeconds = 1)
        {
            var handle = new Handle(this, priority);
            handle.Update(cue, preset, quantization, fadeSeconds);
            _requests.Add(handle);
            return handle;
        }
        public void Clear()
        {
            foreach (var request in _requests) request.Owner = null;
            _requests.Clear();
        }
        public sealed class Handle : IDisposable
        {
            internal MusicRequestResolver Owner;
            internal long Serial;
            public int Priority { get; }
            public MusicCue Cue { get; private set; }
            public string Preset { get; private set; }
            public MusicQuantization Quantization { get; private set; }
            public double FadeSeconds { get; private set; }
            internal Handle(MusicRequestResolver owner, int priority) { Owner = owner; Priority = priority; }
            public void Update(MusicCue cue, string preset, MusicQuantization quantization = MusicQuantization.NextBar, double fadeSeconds = 1)
            {
                if (Owner == null) throw new ObjectDisposedException(nameof(Handle));
                if (!cue) throw new ArgumentNullException(nameof(cue));
                cue.Preset(preset); // Request boundary: unknown presets are setup errors.
                if (!double.IsFinite(fadeSeconds) || fadeSeconds < 0) throw new ArgumentOutOfRangeException(nameof(fadeSeconds));
                if (!Enum.IsDefined(typeof(MusicQuantization), quantization)) throw new ArgumentOutOfRangeException(nameof(quantization));
                Cue = cue; Preset = preset; Quantization = quantization; FadeSeconds = fadeSeconds; Serial = ++Owner._serial;
            }
            public void Dispose()
            {
                if (Owner == null) return;
                Owner._requests.Remove(this); Owner = null;
            }
        }
    }
}
