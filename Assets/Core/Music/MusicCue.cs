using System;
using System.Collections.Generic;
using System.Linq;
using Core.Common;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace Core.Music
{
    [Serializable]
    public sealed class MusicStem
    {
        [Tooltip("One aligned instrument layer. The same clip can be shared by arrangements of a theme.")]
        public string id;
        public AudioClip clip;
    }

    [Serializable]
    public sealed class MusicStemGain
    {
        public string stem;
        [Range(0, 1)] public float gain = 1;
    }

    [Serializable]
    public sealed class MusicMixPreset
    {
        [Tooltip("A named mix: one volume for every stem, including muted stems.")]
        public string id;
        public MusicStemGain[] gains = Array.Empty<MusicStemGain>();
        public float Gain(string stem) => gains.Single(value => value.stem == stem).gain;
    }

    [CreateAssetMenu(menuName = "Game/Audio/Music cue")]
    [Core.Catalogs.DefinitionResource]
    [Core.Scripting.LuaResource("musicCue")]
    public sealed class MusicCue : Core.Catalogs.DefinitionScriptableObject<MusicCueValidator>
    {
        [Tooltip("Same namespaced theme ID for arrangements that share a timeline. Leave empty for an independent cue.")]
        public string theme;
        [Tooltip("Tempo in quarter-note beats per minute; all arrangements of a theme must match.")]
        public double bpm = 120;
        public int beatsPerBar = 4;
        public int loopBars = 4;
        public MusicStem[] stems = Array.Empty<MusicStem>();
        public MusicMixPreset[] presets = Array.Empty<MusicMixPreset>();
        public double BeatSeconds => 60d / bpm;
        public double LoopSeconds => BeatSeconds * beatsPerBar * loopBars;
        public string Theme => string.IsNullOrEmpty(theme) ? Id : theme;
        public MusicMixPreset Preset(string preset) => presets.Single(value => value.id == preset);
    }

    public sealed class MusicCueValidator : ScriptableObjectValidator<MusicCue>
    {
        protected override void CollectConfigurationErrors(MusicCue cue, List<ConfigurationError> errors)
        {
            void Error(string field, string message) => Report(errors, cue, field, message);
            var timingValid = double.IsFinite(cue.bpm) && cue.bpm > 0 && cue.beatsPerBar > 0 && cue.loopBars > 0;
            if (!timingValid) Error("timing", "BPM must be finite and positive; meter and loop bars must be positive.");
            if (!string.IsNullOrEmpty(cue.theme) && !DefinitionIdRules.IsLowercaseNamespaced(cue.theme))
                Error("theme", "Use a lowercase namespace:name theme ID, or leave it empty for an independent cue.");
            var stems = cue.stems ?? Array.Empty<MusicStem>();
            if (stems.Length == 0) Error("stems", "Assign at least one aligned stem.");
            var ids = new HashSet<string>(StringComparer.Ordinal);
            AudioClip first = null;
            foreach (var stem in stems)
            {
                if (stem == null || string.IsNullOrWhiteSpace(stem.id) || !ids.Add(stem.id))
                { Error("stems", "Stem IDs must be present and unique."); continue; }
                if (!stem.clip) { Error("stems", $"Stem '{stem.id}' has no clip."); continue; }
                var clip = stem.clip;
                if (first && (clip.frequency != first.frequency || clip.samples != first.samples))
                    Error("stems", $"Stem '{stem.id}' must match the first stem's sample rate and frame count.");
                first = clip;
                if (timingValid && Math.Abs(clip.samples - cue.LoopSeconds * clip.frequency) > 1)
                    Error("stems", $"Stem '{stem.id}' must span exactly the authored loop (within one sample).");
                if (clip.loadType != AudioClipLoadType.DecompressOnLoad || !clip.preloadAudioData)
                    Error("stems", $"Stem '{stem.id}' requires Decompress On Load and Preload Audio Data.");
#if UNITY_EDITOR
                var importer = AssetImporter.GetAtPath(AssetDatabase.GetAssetPath(clip)) as AudioImporter;
                if (importer != null && importer.loadInBackground)
                    Error("stems", $"Stem '{stem.id}' requires Load In Background disabled for predictable seamless loops.");
#endif
            }
            var presets = cue.presets ?? Array.Empty<MusicMixPreset>();
            if (presets.Length == 0) Error("presets", "Author at least one complete mix preset.");
            var presetIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var preset in presets)
            {
                if (preset == null || string.IsNullOrWhiteSpace(preset.id) || !presetIds.Add(preset.id))
                { Error("presets", "Preset IDs must be present and unique."); continue; }
                var gains = preset.gains ?? Array.Empty<MusicStemGain>();
                var seen = new HashSet<string>(StringComparer.Ordinal);
                foreach (var gain in gains)
                    if (gain == null || gain.stem == null || !ids.Contains(gain.stem) || !seen.Add(gain.stem) || !float.IsFinite(gain.gain) || gain.gain < 0 || gain.gain > 1)
                        Error("presets", $"Preset '{preset.id}' needs unique known stems and finite gains in [0, 1].");
                if (!seen.SetEquals(ids)) Error("presets", $"Preset '{preset.id}' must specify every stem, including muted ones.");
            }
        }
    }

}
