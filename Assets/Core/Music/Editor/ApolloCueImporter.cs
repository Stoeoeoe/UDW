using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Core.Music.Editor
{
    [ScriptedImporter(3, "apollocue", 6100)]
    public sealed class ApolloCueImporter : ScriptedImporter
    {
        private sealed class Manifest
        {
            [JsonRequired] public string id;
            public string theme;
            [JsonRequired] public double bpm;
            [JsonRequired] public int beatsPerBar;
            [JsonRequired] public int loopBars;
            [JsonRequired] public int sampleRate;
            [JsonRequired] public int frames;
            [JsonRequired] public Stem[] stems;
            [JsonRequired] public MusicMixPreset[] presets;
        }

        private sealed class Stem
        {
            [JsonRequired] public string id;
            [JsonRequired] public string file;
            public string sha256;
        }

        private static Manifest Read(string file)
        {
            var manifest = JsonConvert.DeserializeObject<Manifest>(File.ReadAllText(file));
            if (manifest == null || !Regex.IsMatch(manifest.id ?? "", @"^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*$"))
                throw new InvalidOperationException("Apollo cue requires a namespaced content ID.");
            var expected = "Assets/Content/Music/" + manifest.id.Replace(':', '/') + "/cue.apollocue";
            if (file.Replace('\\', '/') != expected)
                throw new InvalidOperationException($"Apollo cue '{manifest.id}' belongs at '{expected}'.");
            if (manifest.stems == null || manifest.stems.Length == 0 || manifest.sampleRate <= 0 || manifest.frames <= 0)
                throw new InvalidOperationException("Apollo cue requires stems and positive sample rate/frame count.");
            foreach (var stem in manifest.stems)
                if (stem == null || !Regex.IsMatch(stem.id ?? "", @"^[a-z0-9][a-z0-9_-]*$") ||
                    !(stem.file == stem.id + ".wav" || IsSharedStem(stem)))
                    throw new InvalidOperationException("Apollo stem must reference its shared content-hash audio file.");
            return manifest;
        }

        private static bool IsSharedStem(Stem stem)
        {
            if (!Regex.IsMatch(stem.sha256 ?? "", @"^[a-f0-9]{64}$")) return false;
            var match = Regex.Match(stem.file ?? "", @"^\.\./_stems/(?:[a-z0-9][a-z0-9_-]*--)?([a-f0-9]{12}|[a-f0-9]{64})\.(ogg|wav)$");
            return match.Success && stem.sha256.StartsWith(match.Groups[1].Value, StringComparison.Ordinal);
        }

        internal static string[] GatherDependenciesFromSourceFile(string assetPath)
        {
            try
            {
                var folder = Path.GetDirectoryName(assetPath).Replace('\\', '/');
                return Read(assetPath).stems.Select(stem => StemPath(folder, stem)).ToArray();
            }
            catch (Exception exception) when (exception is IOException || exception is JsonException || exception is InvalidOperationException)
            {
                // OnImportAsset reports the source error; dependency discovery must
                // also work while a source file is being replaced by the CLI.
                return Array.Empty<string>();
            }
        }

        public override void OnImportAsset(AssetImportContext ctx)
        {
            var manifest = Read(ctx.assetPath);
            var folder = Path.GetDirectoryName(ctx.assetPath).Replace('\\', '/');
            var cue = ScriptableObject.CreateInstance<MusicCue>();
            try
            {
                cue.name = manifest.id.Split(':')[1];
                cue.id = manifest.id;
                cue.theme = manifest.theme;
                cue.bpm = manifest.bpm;
                cue.beatsPerBar = manifest.beatsPerBar;
                cue.loopBars = manifest.loopBars;
                cue.presets = manifest.presets;
                cue.stems = manifest.stems.Select(stem =>
                {
                    var file = StemPath(folder, stem);
                    ctx.DependsOnSourceAsset(file);
                    var clip = AssetDatabase.LoadAssetAtPath<AudioClip>(file);
                    if (!clip) throw new InvalidOperationException($"Apollo stem '{file}' has not imported successfully.");
                    if (clip.samples != manifest.frames || clip.frequency != manifest.sampleRate)
                        throw new InvalidOperationException($"Apollo stem '{stem.id}' does not match its manifest's sample rate/frame count.");
                    return new MusicStem { id = stem.id, clip = clip };
                }).ToArray();
                cue.RequireValidConfiguration();
                ctx.AddObjectToAsset("cue", cue);
                ctx.SetMainObject(cue);
            }
            catch { DestroyImmediate(cue); throw; }
        }

        private static string StemPath(string folder, Stem stem) => stem.file.StartsWith("../_stems/", StringComparison.Ordinal)
            ? Path.GetDirectoryName(folder).Replace('\\', '/') + "/_stems/" + Path.GetFileName(stem.file)
            : folder + "/" + stem.file;
    }

    internal sealed class ApolloStemAudioImporter : AssetPostprocessor
    {
        public override uint GetVersion() => 3;

        private void OnPreprocessAudio()
        {
            if (!Regex.IsMatch(assetPath, @"^Assets/Content/Music/[^/]+/_stems/(?:[a-z0-9][a-z0-9_-]*--)?(?:[a-f0-9]{12}|[a-f0-9]{64})\.(wav|ogg)$") &&
                !File.Exists(Path.Combine(Path.GetDirectoryName(assetPath), "cue.apollocue"))) return;
            var importer = (AudioImporter)assetImporter;
            var settings = importer.defaultSampleSettings;
            settings.compressionFormat = AudioCompressionFormat.Vorbis;
            settings.quality = 1f;
            settings.loadType = AudioClipLoadType.DecompressOnLoad;
            settings.preloadAudioData = true;
            settings.sampleRateSetting = AudioSampleRateSetting.PreserveSampleRate;
            importer.defaultSampleSettings = settings;
            importer.loadInBackground = false;
        }
    }
}
