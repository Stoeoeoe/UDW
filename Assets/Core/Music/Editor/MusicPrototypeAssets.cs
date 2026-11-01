using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace Core.Music.Editor
{
    /// <summary>Offline authored test loops. No synthesis runs during gameplay.</summary>
    public static class MusicPrototypeAssets
    {
        public const string Folder = "Assets/Content/Music/Prototype";
        [MenuItem("Tools/Music/Create prototype cues")]
        public static void Create()
        {
            EnsureFolder(Folder);
            CreateCue("Courtyard", "base:music-prototype-courtyard", 120, new[] { 130.8128, 164.8138, 195.9977, 261.6256 });
            CreateCue("Temple", "base:music-prototype-temple", 100, new[] { 146.8324, 174.6141, 220d, 293.6648 });
            AssetDatabase.SaveAssets();
        }
        private static void EnsureFolder(string folder)
        {
            if (AssetDatabase.IsValidFolder(folder)) return;
            EnsureFolder(Path.GetDirectoryName(folder).Replace('\\', '/'));
            AssetDatabase.CreateFolder(Path.GetDirectoryName(folder).Replace('\\', '/'), Path.GetFileName(folder));
        }
        private static void CreateCue(string name, string id, double bpm, double[] frequencies)
        {
            var assetPath = $"{Folder}/{name}.asset";
            if (AssetDatabase.LoadAssetAtPath<MusicCue>(assetPath)) return;
            const int rate = 48000;
            var length = (int)Math.Round(60d / bpm * 4 * 4 * rate);
            var names = new[] { "bass", "harmony", "pulse", "melody" };
            var stems = new MusicStem[4];
            for (var stem = 0; stem < 4; stem++)
            {
                var path = $"{Folder}/{name}-{names[stem]}.wav";
                using (var writer = new BinaryWriter(File.Create(path)))
                {
                    writer.Write(System.Text.Encoding.ASCII.GetBytes("RIFF")); writer.Write(36 + length * 2);
                    writer.Write(System.Text.Encoding.ASCII.GetBytes("WAVEfmt ")); writer.Write(16);
                    writer.Write((short)1); writer.Write((short)1); writer.Write(rate); writer.Write(rate * 2);
                    writer.Write((short)2); writer.Write((short)16);
                    writer.Write(System.Text.Encoding.ASCII.GetBytes("data")); writer.Write(length * 2);
                    for (var sample = 0; sample < length; sample++)
                    {
                        var time = sample / (double)rate;
                        var beat = time * bpm / 60;
                        var phase = beat % (stem == 3 ? 0.5 : 1);
                        var attack = Math.Min(1, phase * 100);
                        var release = Math.Exp(-phase * (stem == 2 ? 18 : 4));
                        var edge = Math.Min(1, Math.Min(sample, length - 1 - sample) / (rate * 0.01));
                        var note = stem == 3 ? new[] { 1d, 1.25, 1.5, 2 }[(int)(beat * 2) % 4] : 1d;
                        var value = Math.Sin(2 * Math.PI * frequencies[stem] * note * time) * attack * release * edge * 0.16;
                        writer.Write((short)(value * short.MaxValue));
                    }
                }
                AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
                var importer = (AudioImporter)AssetImporter.GetAtPath(path);
                var settings = importer.defaultSampleSettings;
                settings.loadType = AudioClipLoadType.DecompressOnLoad; settings.compressionFormat = AudioCompressionFormat.PCM;
                settings.sampleRateSetting = AudioSampleRateSetting.PreserveSampleRate;
                settings.preloadAudioData = true;
                importer.defaultSampleSettings = settings;
                importer.loadInBackground = false; importer.SaveAndReimport();
                stems[stem] = new MusicStem { id = names[stem], clip = AssetDatabase.LoadAssetAtPath<AudioClip>(path) };
            }
            var cue = ScriptableObject.CreateInstance<MusicCue>();
            cue.id = id; cue.bpm = bpm; cue.beatsPerBar = 4; cue.loopBars = 4; cue.stems = stems;
            cue.presets = new[]
            {
                Preset("calm", names, new[] { 0.6f, 0.4f, 0f, 0f }),
                Preset("active", names, new[] { 0.7f, 0.5f, 0.6f, 0.3f }),
                Preset("intense", names, new[] { 0.8f, 0.6f, 0.8f, 0.7f })
            };
            cue.RequireValidConfiguration();
            AssetDatabase.CreateAsset(cue, assetPath);
        }
        private static MusicMixPreset Preset(string id, string[] names, float[] gains) => new()
        { id = id, gains = names.Select((name, index) => new MusicStemGain { stem = name, gain = gains[index] }).ToArray() };
    }
}
