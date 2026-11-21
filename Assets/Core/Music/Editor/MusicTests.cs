using System;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Audio;
using Object = UnityEngine.Object;

namespace Core.Music.Editor
{
    public sealed class MusicTests
    {
        private MusicCue _cue, _other;
        private AudioClip _clip;
        private GameObject _root;
        [SetUp]
        public void SetUp()
        {
            _clip = AudioClip.Create("Aligned fixture", 192000, 1, 48000, false);
            _cue = Cue("test:one"); _other = Cue("test:two");
            _root = new GameObject("Music tests");
        }
        private MusicCue Cue(string id)
        {
            var cue = ScriptableObject.CreateInstance<MusicCue>();
            cue.SetId(id); cue.bpm = 120; cue.beatsPerBar = 4; cue.loopBars = 2;
            cue.stems = new[] { new MusicStem { id = "pulse", clip = _clip }, new MusicStem { id = "pad", clip = _clip } };
            cue.presets = new[] { new MusicMixPreset { id = "calm", gains = new[] { new MusicStemGain { stem = "pulse", gain = 0 }, new MusicStemGain { stem = "pad", gain = 1 } } },
                new MusicMixPreset { id = "busy", gains = new[] { new MusicStemGain { stem = "pulse", gain = 1 }, new MusicStemGain { stem = "pad", gain = 0.5f } } } };
            return cue;
        }
        [TearDown]
        public void TearDown()
        { Object.DestroyImmediate(_root); Object.DestroyImmediate(_cue); Object.DestroyImmediate(_other); Object.DestroyImmediate(_clip); }

        [Test]
        public void TransportUsesFixedEpochAndHonorsSchedulingLeadAfterLongRuns()
        {
            var clock = new MusicTransport(123.25, 120, 3);
            Assert.That(clock.Boundary(124.26, MusicQuantization.Immediate), Is.EqualTo(124.26));
            Assert.That(clock.Boundary(124.26, MusicQuantization.NextBeat), Is.EqualTo(124.75));
            Assert.That(clock.Boundary(124.26, MusicQuantization.NextBar), Is.EqualTo(124.75));
            Assert.That(clock.Boundary(124.75, MusicQuantization.NextBar), Is.EqualTo(124.75));
            Assert.That(clock.Boundary(124.7501, MusicQuantization.NextBar), Is.EqualTo(126.25));
            Assert.That(clock.BeatAt(123.25 + 86400), Is.EqualTo(172800));
            Assert.That(clock.Boundary(123.25 + 86400.01, MusicQuantization.NextBar), Is.EqualTo(123.25 + 86401.5));
        }
        [Test]
        public void ArbitrationReleasesToLatestEnvironmentAndDisposedHandlesCannotAffectNewRequests()
        {
            var resolver = new MusicRequestResolver();
            using var environment = resolver.Request(_cue, "calm");
            var cutscene = resolver.Request(_other, "busy", 1000);
            using var zone = resolver.Request(_cue, "busy");
            Assert.That(resolver.Winner, Is.SameAs(cutscene));
            environment.Update(_cue, "calm");
            cutscene.Dispose(); cutscene.Dispose();
            Assert.That(resolver.Winner, Is.SameAs(environment));
            environment.Dispose();
            Assert.That(resolver.Winner, Is.SameAs(zone));
            resolver.Clear();
            Assert.That(resolver.Winner, Is.Null);
            Assert.Throws<ObjectDisposedException>(() => zone.Update(_cue, "calm"));
        }
        [Test]
        public void InvalidRequestsDoNotReplaceExistingSelection()
        {
            var resolver = new MusicRequestResolver();
            using var request = resolver.Request(_cue, "calm");
            Assert.Throws<InvalidOperationException>(() => request.Update(_other, "missing"));
            Assert.Throws<ArgumentOutOfRangeException>(() => request.Update(_other, "busy", fadeSeconds: double.NaN));
            Assert.That(request.Cue, Is.SameAs(_cue));
            Assert.That(request.Preset, Is.EqualTo("calm"));
            Assert.That(resolver.Count, Is.EqualTo(1));
        }
        [Test]
        public void ValidationRejectsMisalignedClipsAndIncompleteOrDuplicateGains()
        {
            Assert.That(_cue.ValidateConfiguration(), Is.Empty);
            _cue.stems[1].id = "pulse";
            Assert.That(_cue.ValidateConfiguration(), Is.Not.Empty);
            _cue.stems[1].id = "pad";
            _cue.presets[0].gains = new[] { new MusicStemGain { stem = "pad", gain = float.NaN } };
            Assert.That(_cue.ValidateConfiguration().Select(error => error.Setting), Does.Contain("presets"));
            _other.bpm = 121;
            Assert.That(_other.ValidateConfiguration().Select(error => error.Setting), Does.Contain("stems"));
        }
        [Test]
        public void RelatedArrangementsKeepSharedSourcesAndTransport()
        {
            var mixer = AssetDatabase.LoadAssetAtPath<AudioMixer>("Assets/TopDownEngine/ThirdParty/MoreMountains/MMTools/Core/MMAudio/MMSoundManager/Settings/MMSoundManagerAudioMixer.mixer");
            var alternate = AudioClip.Create("Alternate layer", 192000, 1, 48000, false);
            try
            {
                _cue.theme = _other.theme = "test:theme";
                _other.stems[1].clip = alternate;
                using var engine = new MusicPlaybackEngine(_root.transform, mixer.FindMatchingGroups("Music").Single());
                using var request = new MusicRequestResolver().Request(_cue, "busy", fadeSeconds: 0);
                var now = AudioSettings.dspTime;
                engine.Tick(now, 0.2, request);
                engine.Tick(now + 0.3, 0.2, request);
                var original = _root.GetComponentsInChildren<AudioSource>();
                request.Update(_other, "busy", MusicQuantization.Immediate, 1);
                engine.Tick(now + 0.5, 0.2, request);
                var switched = _root.GetComponentsInChildren<AudioSource>();
                Assert.That(engine.GroupCount, Is.EqualTo(1));
                Assert.That(switched, Does.Contain(original[0]));
                Assert.That(switched, Does.Contain(original[1]));
                Assert.That(switched.Length, Is.EqualTo(3));
                Assert.That(engine.Beat(now + 0.5), Is.EqualTo(0.6).Within(0.001));
                engine.Tick(now + 1.2, 0.2, request);
                Assert.That(original[0].volume, Is.EqualTo(1).Within(0.001));
                Assert.That(original[1].volume, Is.EqualTo(Mathf.Sqrt(0.5f) * 0.5f).Within(0.001));
                Assert.That(switched.Single(source => source.clip == alternate).volume,
                    Is.EqualTo(Mathf.Sqrt(0.5f) * 0.5f).Within(0.001));
            }
            finally { Object.DestroyImmediate(alternate); }
        }
        [Test]
        public void PlaybackCancelsPendingTransitionsBoundsGroupsAndKeepsSourcesForMixChanges()
        {
            var mixer = AssetDatabase.LoadAssetAtPath<AudioMixer>("Assets/TopDownEngine/ThirdParty/MoreMountains/MMTools/Core/MMAudio/MMSoundManager/Settings/MMSoundManagerAudioMixer.mixer");
            using var engine = new MusicPlaybackEngine(_root.transform, mixer.FindMatchingGroups("Music").Single());
            var requests = new MusicRequestResolver();
            using var request = requests.Request(_cue, "calm", fadeSeconds: 0);
            var now = AudioSettings.dspTime;
            engine.Tick(now, 0.2, request); engine.Tick(now + 0.3, 0.2, request);
            var sources = _root.GetComponentsInChildren<AudioSource>();
            request.Update(_cue, "busy", fadeSeconds: 1);
            engine.Tick(now + 0.4, 0.2, request);
            Assert.That(_root.GetComponentsInChildren<AudioSource>(), Is.EqualTo(sources));
            Assert.That(sources[0].loop, Is.True);
            Assert.That(sources[0].volume, Is.Zero);
            engine.Tick(now + 0.9, 0.2, request);
            Assert.That(sources[0].volume, Is.EqualTo(0.5).Within(0.001));
            request.Update(_other, "busy"); engine.Tick(now + 1, 0.2, request);
            Assert.That(engine.GroupCount, Is.EqualTo(2));
            Assert.That(engine.TransitionDspTime, Is.EqualTo(now + 2.2).Within(0.001));
            request.Update(_cue, "calm"); engine.Tick(now + 1.1, 0.2, request);
            Assert.That(engine.GroupCount, Is.EqualTo(1));
            request.Update(_other, "busy", MusicQuantization.Immediate, 1);
            engine.Tick(now + 1.2, 0.2, request);
            request.Update(_cue, "busy"); engine.Tick(now + 1.5, 0.2, request);
            Assert.That(engine.GroupCount, Is.EqualTo(2));
            engine.Tick(now + 2.5, 0.2, request);
            Assert.That(engine.GroupCount, Is.LessThanOrEqualTo(2));
            engine.Dispose();
            Assert.That(_root.GetComponentsInChildren<AudioSource>(), Is.Empty);
        }
    }
}
