using System;
using System.Linq;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Music.Editor
{
    /// <summary>
    /// Short synthesized loops for playback tests. They live only in memory, so they never enter the shipped music
    /// catalog; the caller destroys them with <see cref="Destroy"/>.
    /// </summary>
    public static class MusicTestCues
    {
        private const int Rate = 48000;
        private static readonly string[] StemNames = { "bass", "harmony", "pulse", "melody" };

        public static MusicCue Create(string id, double bpm, double[] frequencies)
        {
            var length = (int)Math.Round(60d / bpm * 4 * 4 * Rate);
            var stems = new MusicStem[StemNames.Length];
            for (var stem = 0; stem < stems.Length; stem++)
            {
                var samples = new float[length];
                for (var sample = 0; sample < length; sample++)
                {
                    var time = sample / (double)Rate;
                    var beat = time * bpm / 60;
                    var phase = beat % (stem == 3 ? 0.5 : 1);
                    var attack = Math.Min(1, phase * 100);
                    var release = Math.Exp(-phase * (stem == 2 ? 18 : 4));
                    var edge = Math.Min(1, Math.Min(sample, length - 1 - sample) / (Rate * 0.01));
                    var note = stem == 3 ? new[] { 1d, 1.25, 1.5, 2 }[(int)(beat * 2) % 4] : 1d;
                    samples[sample] = (float)(Math.Sin(2 * Math.PI * frequencies[stem] * note * time) * attack * release * edge * 0.16);
                }
                var clip = AudioClip.Create($"{id}-{StemNames[stem]}", length, 1, Rate, false);
                clip.SetData(samples, 0);
                stems[stem] = new MusicStem { id = StemNames[stem], clip = clip };
            }
            var cue = ScriptableObject.CreateInstance<MusicCue>();
            cue.SetId(id); cue.bpm = bpm; cue.beatsPerBar = 4; cue.loopBars = 4; cue.stems = stems;
            cue.presets = new[]
            {
                Preset("calm", new[] { 0.6f, 0.4f, 0f, 0f }),
                Preset("active", new[] { 0.7f, 0.5f, 0.6f, 0.3f }),
                Preset("intense", new[] { 0.8f, 0.6f, 0.8f, 0.7f })
            };
            cue.RequireValidConfiguration();
            return cue;
        }

        public static void Destroy(MusicCue cue)
        {
            if (!cue) return;
            foreach (var stem in cue.stems) Object.DestroyImmediate(stem.clip);
            Object.DestroyImmediate(cue);
        }

        private static MusicMixPreset Preset(string id, float[] gains) => new()
        { id = id, gains = StemNames.Select((name, index) => new MusicStemGain { stem = name, gain = gains[index] }).ToArray() };
    }
}
