using System;

namespace Core.Music
{
    public enum MusicQuantization { Immediate, NextBeat, NextBar }

    /// <summary>All positions derive from a fixed DSP epoch, never accumulated frame deltas.</summary>
    public readonly struct MusicTransport
    {
        public readonly double Epoch, BeatSeconds;
        public readonly int BeatsPerBar;
        public MusicTransport(double epoch, double bpm, int beatsPerBar)
        {
            if (!double.IsFinite(epoch) || !double.IsFinite(bpm) || bpm <= 0 || beatsPerBar <= 0)
                throw new ArgumentOutOfRangeException(nameof(bpm));
            Epoch = epoch; BeatSeconds = 60d / bpm; BeatsPerBar = beatsPerBar;
        }
        public double BeatAt(double dspTime) => (dspTime - Epoch) / BeatSeconds;
        public double Boundary(double earliest, MusicQuantization quantization)
        {
            if (quantization == MusicQuantization.Immediate) return earliest;
            var interval = BeatSeconds * (quantization == MusicQuantization.NextBar ? BeatsPerBar : 1);
            return Epoch + Math.Max(0, Math.Ceiling((earliest - Epoch) / interval)) * interval;
        }
    }
}
