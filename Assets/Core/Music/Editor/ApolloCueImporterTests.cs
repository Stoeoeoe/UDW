using System;
using System.IO;
using System.Text;
using Newtonsoft.Json;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Core.Music.Editor
{
    public sealed class ApolloCueImporterTests
    {
        private string _folder;

        public static MusicCue CreateFixture(string name)
        {
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            const string parent = "Assets/Content/Music/test";
            if (!AssetDatabase.IsValidFolder(parent)) AssetDatabase.CreateFolder("Assets/Content/Music", "test");
            var folder = parent + "/" + name;
            Assert.That(AssetDatabase.CreateFolder(parent, name), Is.Not.Empty);
            var manifest = new { id = "test:" + name, bpm = 120, beatsPerBar = 4, loopBars = 1,
                sampleRate = 48000, frames = 96000,
                stems = new[] { new { id = "low", file = "low.wav" }, new { id = "high", file = "high.wav" } },
                presets = new[] { new { id = "full", gains = new[] { new { stem = "low", gain = 1f }, new { stem = "high", gain = 0.5f } } } } };
            var source = folder + "/cue.apollocue";
            File.WriteAllText(source, JsonConvert.SerializeObject(manifest));
            for (var stem = 0; stem < 2; stem++)
            {
                var file = folder + (stem == 0 ? "/low.wav" : "/high.wav");
                using (var writer = new BinaryWriter(File.Create(file)))
                {
                    writer.Write(Encoding.ASCII.GetBytes("RIFF")); writer.Write(36 + 96000 * 4);
                    writer.Write(Encoding.ASCII.GetBytes("WAVEfmt ")); writer.Write(16);
                    writer.Write((short)1); writer.Write((short)2); writer.Write(48000); writer.Write(48000 * 4);
                    writer.Write((short)4); writer.Write((short)16);
                    writer.Write(Encoding.ASCII.GetBytes("data")); writer.Write(96000 * 4);
                    for (var frame = 0; frame < 96000; frame++)
                    {
                        var sample = (short)(Math.Sin(frame * 2 * Math.PI * (stem == 0 ? 110 : 220) / 48000) * 2000);
                        writer.Write(sample); writer.Write(sample);
                    }
                }
                AssetDatabase.ImportAsset(file, ImportAssetOptions.ForceSynchronousImport);
            }
            AssetDatabase.ImportAsset(source, ImportAssetOptions.ForceSynchronousImport);
            var cue = AssetDatabase.LoadAssetAtPath<MusicCue>(source);
            Assert.That(cue, Is.Not.Null);
            return cue;
        }

        [SetUp]
        public void SetUp() => _folder = "Assets/Content/Music/test/import-" + Guid.NewGuid().ToString("N");
        [TearDown]
        public void TearDown() => AssetDatabase.DeleteAsset(_folder);

        [Test]
        public void ManifestImportsAlignedStemsAndPresetsWithoutManualSetup()
        {
            var cue = CreateFixture(Path.GetFileName(_folder));
            cue.RequireValidConfiguration();
            Assert.That(cue.stems.Length, Is.EqualTo(2));
            Assert.That(cue.Preset("full").Gain("high"), Is.EqualTo(0.5f));
            foreach (var stem in cue.stems)
            {
                Assert.That(stem.clip.samples, Is.EqualTo(96000));
                Assert.That(stem.clip.frequency, Is.EqualTo(48000));
                var importer = (AudioImporter)AssetImporter.GetAtPath(AssetDatabase.GetAssetPath(stem.clip));
                Assert.That(importer.defaultSampleSettings.compressionFormat, Is.EqualTo(AudioCompressionFormat.Vorbis));
                Assert.That(importer.defaultSampleSettings.sampleRateSetting, Is.EqualTo(AudioSampleRateSetting.PreserveSampleRate));
                Assert.That(importer.loadInBackground, Is.False);
            }
        }

        [Test]
        public void ReimportKeepsCueGuidAndLocalIdStable()
        {
            var cue = CreateFixture(Path.GetFileName(_folder));
            var file = AssetDatabase.GetAssetPath(cue);
            AssetDatabase.TryGetGUIDAndLocalFileIdentifier(cue, out string guid, out long localId);
            AssetDatabase.ImportAsset(file, ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
            cue = AssetDatabase.LoadAssetAtPath<MusicCue>(file);
            AssetDatabase.TryGetGUIDAndLocalFileIdentifier(cue, out string nextGuid, out long nextLocalId);
            Assert.That(nextGuid, Is.EqualTo(guid));
            Assert.That(nextLocalId, Is.EqualTo(localId));
        }
    }
}
