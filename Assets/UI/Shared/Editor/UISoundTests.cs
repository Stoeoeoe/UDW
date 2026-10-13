using System.Collections.Generic;
using System.Reflection;
using MoreMountains.Tools;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Audio;
using Object = UnityEngine.Object;

namespace UI.Shared.Editor
{
    [Category("UIScreen")]
    public sealed class UISoundTests
    {
        private GameObject _root;
        private Core.Common.Editor.GameTestFixture _fixture;
        private UrGUIManager _manager;
        private PauseTestScreen _screen;
        private AudioClip _clip;
        private readonly List<Object> _assets = new();
        private readonly List<AudioClip> _played = new();
        private float _volume;
        private float _pitch;
        private AudioMixerGroup _group;
        private MMSoundManager.MMSoundManagerTracks _track;

        [SetUp]
        public void SetUp()
        {
            Assert.That(UrGUIManager.Instance, Is.Null);
            _played.Clear();
            _fixture = new Core.Common.Editor.GameTestFixture("UI sound tests");
            _root = _fixture.Root;
            _root.SetActive(true);
            UIScreenPauseTests.CreateScreenServices(_fixture);
            _manager = _fixture.AddSingleton<UrGUIManager>(manager => manager.gameObject.SetActive(true));
            _screen = _root.AddComponent<PauseTestScreen>();
            _clip = AudioClip.Create("UI cue", 32, 1, 44100, false);
            _assets.Add(_clip);
            MMSoundManagerSoundPlayEvent.Register(Capture);
        }

        [TearDown]
        public void TearDown()
        {
            MMSoundManagerSoundPlayEvent.Unregister(Capture);
            _fixture?.Dispose();
            foreach (var asset in _assets) Object.DestroyImmediate(asset);
            _assets.Clear();
        }

        private AudioSource Capture(AudioClip clip, MMSoundManagerPlayOptions options)
        {
            _played.Add(clip); _group = options.AudioGroup; _volume = options.Volume; _pitch = options.Pitch;
            _track = options.MmSoundManagerTrack;
            return null;
        }

        private UISoundProfile Profile(params UISoundProfile.Sound[] entries)
        {
            var profile = ScriptableObject.CreateInstance<UISoundProfile>();
            typeof(UISoundProfile).GetField("sounds", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(profile, entries);
            _assets.Add(profile);
            return profile;
        }

        private UISoundProfile.Sound Cue(UISoundCue cue) => new() { cue = cue, clips = new[] { _clip } };

        [Test]
        public void PlaybackUsesAuthoredClipMixerVolumeAndPitch()
        {
            var defaults = AssetDatabase.LoadAssetAtPath<UISoundProfile>("Assets/UI/Shared/DefaultUISounds.asset");
            Assert.That(defaults.TryGet(UISoundCue.Click, out var authored), Is.True);
            var cue = Cue(UISoundCue.Click);
            cue.mixerGroup = authored.mixerGroup;
            cue.volume = 0.37f;
            cue.pitchRange = new Vector2(1.2f, 1.2f);
            _manager.SoundProfile = Profile(cue);
            Assert.That(_manager.PlaySound(UISoundCue.Click), Is.True);
            Assert.That(_played, Is.EqualTo(new[] { _clip }));
            Assert.That(_group, Is.SameAs(authored.mixerGroup));
            Assert.That(_volume, Is.EqualTo(0.37f));
            Assert.That(_pitch, Is.EqualTo(1.2f));
            Assert.That(_track, Is.EqualTo(MMSoundManager.MMSoundManagerTracks.UI));
        }

        [Test]
        public void OverridesReplaceInheritAndExplicitlySilenceIndividualCues()
        {
            _manager.SoundProfile = Profile(Cue(UISoundCue.Click), Cue(UISoundCue.Open), Cue(UISoundCue.Denied));
            var otherClip = AudioClip.Create("Override cue", 32, 1, 44100, false);
            _assets.Add(otherClip);
            _screen.SoundOverrides = Profile(
                new UISoundProfile.Sound { cue = UISoundCue.Click, clips = new[] { otherClip } },
                new UISoundProfile.Sound { cue = UISoundCue.Denied });
            Assert.That(_manager.PlaySound(UISoundCue.Click, _screen), Is.True);
            Assert.That(_manager.PlaySound(UISoundCue.Open, _screen), Is.True);
            Assert.That(_manager.PlaySound(UISoundCue.Denied, _screen), Is.False);
            Assert.That(_played, Is.EqualTo(new[] { otherClip, _clip }));
        }

        [Test]
        public void RebindingDoesNotReplayOpenAndRepeatedCloseDoesNotReplayClose()
        {
            _manager.SoundProfile = Profile(Cue(UISoundCue.Open), Cue(UISoundCue.Close));
            _screen.Open(null, ScreenPauseMode.None);
            _screen.Open(null, ScreenPauseMode.None);
            Assert.That(_played.Count, Is.EqualTo(1));
            _screen.Close();
            _screen.Close();
            Assert.That(_played.Count, Is.EqualTo(2));
        }

        [TestCase(true)]
        [TestCase(false)]
        public void TeardownClosesSilently(bool disableScreen)
        {
            _manager.SoundProfile = Profile(Cue(UISoundCue.Close));
            _screen.Open(null, ScreenPauseMode.None);
            if (disableScreen) UIScreenPauseTests.Invoke(_screen, "OnDisable");
            else _manager.OnLocationLeave(null);
            Assert.That(_screen.Visible, Is.False);
            Assert.That(_played, Is.Empty);
        }

        [Test]
        public void MissingProfilesAndCuesAreSilent()
        {
            Assert.That(_manager.PlaySound(UISoundCue.Click), Is.False);
            _manager.SoundProfile = Profile(Cue(UISoundCue.Open));
            Assert.That(_manager.PlaySound(UISoundCue.Click), Is.False);
            Assert.That(_played, Is.Empty);
        }
    }
}
