using Core.Common.Editor;
using Core.Location;
using VContainer;
using System;
using System.Collections;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Audio;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace Core.Music.Editor
{
    public sealed class MusicPlaybackTests
    {
        private SceneSetup[] _scenes;
        private GameObject _root;
        private MusicPlaybackEngine _engine;
        private MusicRequestResolver _resolver;
        private MusicRequestResolver.Handle _request;
        private MusicCue _first, _second;

        [UnitySetUp]
        public IEnumerator SetUp()
        {
            _scenes = EditorSceneManager.GetSceneManagerSetup();
            if (UnityEngine.SceneManagement.SceneManager.GetActiveScene().path != "Assets/Scenes/Maps/map-1.unity")
            {
                Assert.That(_scenes.All(scene => !UnityEngine.SceneManagement.SceneManager.GetSceneByPath(scene.path).isDirty),
                    Is.True, "Run this fixture from the playable map or with saved scenes.");
                EditorSceneManager.OpenScene("Assets/Scenes/Maps/map-1.unity", OpenSceneMode.Single);
            }
            yield return new EnterPlayMode();
            Application.runInBackground = true;
            var deadline = Time.realtimeSinceStartupAsDouble + 15;
            while (!LiveGame.Get<LevelManager>() || !LiveGame.Get<LevelManager>().SceneReady)
            {
                Assert.That(Time.realtimeSinceStartupAsDouble, Is.LessThan(deadline));
                yield return null;
            }
            _root = new GameObject("Music playback fixture");
            var mixer = AssetDatabase.LoadAssetAtPath<AudioMixer>("Assets/TopDownEngine/ThirdParty/MoreMountains/MMTools/Core/MMAudio/MMSoundManager/Settings/MMSoundManagerAudioMixer.mixer");
            _first = MusicTestCues.Create("test:courtyard", 120, new[] { 130.8128, 164.8138, 195.9977, 261.6256 });
            _second = MusicTestCues.Create("test:temple", 100, new[] { 146.8324, 174.6141, 220d, 293.6648 });
            _engine = new MusicPlaybackEngine(_root.transform, mixer.FindMatchingGroups("Music").Single());
            _resolver = new MusicRequestResolver();
            _request = _resolver.Request(_first, "calm", quantization: MusicQuantization.Immediate, fadeSeconds: 0);
        }
        [UnityTearDown]
        public IEnumerator TearDown()
        {
            AudioListener.pause = false; Time.timeScale = 1;
            _request?.Dispose(); _engine?.Dispose();
            if (_root) Object.Destroy(_root);
            MusicTestCues.Destroy(_first); MusicTestCues.Destroy(_second);
            yield return new ExitPlayMode();
            if (_scenes != null && _scenes.Length > 0 && _scenes.All(scene => !string.IsNullOrEmpty(scene.path)) &&
                !_scenes.Select(scene => scene.path).SequenceEqual(EditorSceneManager.GetSceneManagerSetup().Select(scene => scene.path)))
                EditorSceneManager.RestoreSceneManagerSetup(_scenes);
        }

        private IEnumerator Advance(double seconds, bool aligned = true)
        {
            var until = AudioSettings.dspTime + seconds;
            var deadline = Time.realtimeSinceStartupAsDouble + seconds + 10;
            var misalignedFrames = 0;
            while (AudioSettings.dspTime < until)
            {
                Assert.That(Time.realtimeSinceStartupAsDouble, Is.LessThan(deadline), "DSP must keep advancing.");
                _engine.Tick(AudioSettings.dspTime, 0.2, _resolver.Winner);
                if (aligned && _engine.GroupCount == 1)
                {
                    var sources = _root.GetComponentsInChildren<AudioSource>();
                    if (sources.Length > 0 && sources.All(source => source.isPlaying))
                    {
                        // Audio properties are read across threads. Discard a snapshot that
                        // straddled an audio-buffer boundary instead of comparing two clocks.
                        var dspBefore = AudioSettings.dspTime;
                        var samples = sources.Select(source => source.timeSamples).ToArray();
                        var maxDistance = 0;
                        foreach (var sample in samples)
                        {
                            var distance = Math.Abs(samples[0] - sample);
                            distance = Math.Min(distance, sources[0].clip.samples - distance);
                            maxDistance = Math.Max(distance, maxDistance);
                        }
                        // Unity exposes each source cursor independently while its audio
                        // thread processes a buffer. Real drift persists across frames;
                        // a transient partially processed buffer does not.
                        misalignedFrames = maxDistance > 1 && dspBefore == AudioSettings.dspTime ? misalignedFrames + 1 : 0;
                        Assert.That(misalignedFrames, Is.LessThan(3),
                            $"Persistent sample misalignment at DSP {dspBefore:F4}: {string.Join(",", samples)}");
                    }
                }
                yield return null;
            }
        }

        [UnityTest]
        public IEnumerator LoopsMixesPauseAndRapidTransitionsUseRealDspPlayback()
        {
            yield return Advance(0.5);
            var sources = _root.GetComponentsInChildren<AudioSource>();
            Assert.That(sources.Length, Is.EqualTo(4));
            Assert.That(sources.All(source => source.isPlaying), Is.True);
            Assert.That(sources[2].volume, Is.Zero);
            _request.Update(_first, "intense", fadeSeconds: 0.1);
            yield return Advance(_first.LoopSeconds * 2 + 0.5);
            Assert.That(_root.GetComponentsInChildren<AudioSource>(), Is.EqualTo(sources));
            Assert.That(sources[2].volume, Is.GreaterThan(0));
            Time.timeScale = 0;
            var beat = _engine.Beat(AudioSettings.dspTime);
            yield return Advance(0.3);
            Assert.That(_engine.Beat(AudioSettings.dspTime), Is.GreaterThan(beat));
            Time.timeScale = 1;
            AudioListener.pause = true;
            yield return null;
            var paused = AudioSettings.dspTime;
            yield return new WaitForSecondsRealtime(0.2f);
            Assert.That(AudioSettings.dspTime, Is.EqualTo(paused).Within(0.001));
            AudioListener.pause = false;
            for (var i = 0; i < 80; i++)
            {
                _request.Update(i % 2 == 0 ? _first : _second, "active", MusicQuantization.NextBeat, 0.1);
                _engine.Tick(AudioSettings.dspTime, 0.2, _resolver.Winner);
                Assert.That(_engine.GroupCount, Is.LessThanOrEqualTo(2));
                yield return null;
                Assert.That(_root.GetComponentsInChildren<AudioSource>().Length, Is.LessThanOrEqualTo(8));
            }
            using (var cutscene = _resolver.Request(_second, "intense", 1000, MusicQuantization.NextBeat, 0.1))
            {
                yield return Advance(1.5, false);
                Assert.That(_engine.CurrentCue, Is.EqualTo(_second.id));
                _request.Update(_first, "calm", MusicQuantization.Immediate, 0.1);
            }
            yield return Advance(0.7, false);
            Assert.That(_engine.CurrentCue, Is.EqualTo(_first.id));
            _request.Dispose();
            yield return Advance(1.5, false);
            Assert.That(_engine.GroupCount, Is.Zero);
            Assert.That(_root.GetComponentsInChildren<AudioSource>(), Is.Empty);
        }

        [UnityTest, Explicit("Ten-minute real-audio loop soak; run with include_explicit enabled.")]
        public IEnumerator TenMinuteLoopAlignmentSoak()
        { yield return Advance(600); }
    }
}
