using System;
using System.Linq;
using System.Reflection;
using Character.Animations;
using Core.Tile.Vulcanus;
using Core.TimeAndWeather;
using MoreMountains.Tools;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Scripting.Editor
{
    public sealed class AudioLuaApiTests
    {
        private GameObject _root;
        private AudioTestSoundManager _manager;
        private SoundCatalog _catalog;
        private SoundDefinition _sound;
        private AudioClip _clip;
        private AudioLuaApi _api;

        [SetUp]
        public void SetUp()
        {
            _root = new GameObject("Audio action fixture");
            _root.SetActive(false);
            _manager = _root.AddComponent<AudioTestSoundManager>();
            var map = _root.AddComponent<VulcanusImportedMap>();
            map.Configure("test:map", "Audio fixture", 32, 24, 16);
            _root.transform.position = new Vector3(3, 4, 0);
            var anchorObject = new GameObject("Sound anchor");
            anchorObject.transform.SetParent(_root.transform);
            anchorObject.transform.position = new Vector3(8, 9, 0);
            var anchor = anchorObject.AddComponent<VulcanusMapAnchor>();
            anchor.Configure("bell", "Bell", Vector2.zero, Array.Empty<string>());
            _clip = AudioClip.Create("Bell", 4410, 1, 44100, false);
            _sound = ScriptableObject.CreateInstance<SoundDefinition>();
            _sound.name = "Bell";
            typeof(SoundDefinition).GetField("soundId", BindingFlags.NonPublic | BindingFlags.Instance).SetValue(_sound, "test:bell");
            typeof(SoundDefinition).GetField("clip", BindingFlags.NonPublic | BindingFlags.Instance).SetValue(_sound, _clip);
            _catalog = ScriptableObject.CreateInstance<SoundCatalog>();
            _catalog.Synchronize(new Object[] { _sound });
            _api = new AudioLuaApi(_manager, map, _catalog);
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_root);
            Object.DestroyImmediate(_catalog);
            Object.DestroyImmediate(_sound);
            Object.DestroyImmediate(_clip);
        }

        [Test]
        public void GlobalAndPositionalSoundsUseTheSfxTrackAndContinueImmediately()
        {
            using var run = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(_api),
                "Audio.PlaySound('test:bell', nil); Audio.PlaySound('test:bell', { x = 168, y = 104 })", "Sound fixture");
            run.Tick(0);
            Assert.That(run.IsRunning, Is.False);
            Assert.That(_manager.Calls, Is.EqualTo(2));
            Assert.That(_manager.Clip, Is.SameAs(_clip));
            Assert.That(_manager.FirstOptions.SpatialBlend, Is.Zero);
            Assert.That(_manager.Options.SpatialBlend, Is.EqualTo(1));
            Assert.That(_manager.Options.Location, Is.EqualTo(new Vector3(13.5f, 21.5f, 0)));
            Assert.That(_manager.Options.MmSoundManagerTrack, Is.EqualTo(MMSoundManager.MMSoundManagerTracks.Sfx));
            Assert.That(_manager.Options.Loop, Is.False);
        }

        [Test]
        public void AnchorAndInvalidReferencesUseSharedPositionAndCatalogValidation()
        {
            _api.ValidateSound("test:bell", new MapPosition("bell"));
            _api.PlaySound("test:bell", new MapPosition("bell"));
            Assert.That(_manager.Options.Location, Is.EqualTo(new Vector3(8, 9, 0)));
            Assert.That(() => _api.ValidateSound("test:bell", new MapPosition("missing")), Throws.InvalidOperationException);
            Assert.That(() => _api.ValidateSound("test:bell", new MapPosition(9999, 1)), Throws.TypeOf<ArgumentOutOfRangeException>());
            _catalog.SetEnabled(_sound, false);
            Assert.That(() => _api.ValidateSound("test:bell", null), Throws.InvalidOperationException);
            Assert.That(() => _api.ValidateSound("missing", null), Throws.InvalidOperationException);
            Assert.That(_manager.Calls, Is.EqualTo(1));
        }

        [Test]
        public void NullablePositionCompilesSerializesAndBindsWithoutInventingCoordinates()
        {
            var source = JArray.Parse("[{ 'id':'global', 'action':'audio.playSound', 'arguments': { 'sound':'test:bell', 'position':null } }]");
            var compiled = CutsceneSequenceCompiler.Compile(source, "Sound fixture", out var steps);
            Assert.That(compiled, Does.Contain("Audio.PlaySound(\"test:bell\", nil)"));
            var roundTrip = JsonUtility.FromJson<CutsceneStep>(JsonUtility.ToJson(steps.Single()));
            Assert.That(roundTrip.Arguments.Single(argument => argument.Name == "position").IsNull, Is.True);
            var bindings = CutsceneBindings.BindSequence(new[] { roundTrip }, "cutscene", (typeof(AudioLuaApi), () => _api));
            using var run = VulcanusLuaEngine.StartSession(bindings, compiled, "Sound fixture");
            run.Tick(0);
            Assert.That(_manager.Calls, Is.EqualTo(1));
            Assert.That(_manager.Options.SpatialBlend, Is.Zero);
            source[0]["arguments"]["position"] = new JObject { ["anchor"] = "bell" };
            Assert.That(CutsceneSequenceCompiler.Compile(source, "Sound fixture"), Does.Contain("{ anchor = \"bell\" }"));
            var requiredPosition = JArray.Parse("[{ 'id':'place', 'action':'characters.place', 'arguments': { 'character':'player', 'position':null } }]");
            Assert.That(() => CutsceneSequenceCompiler.Compile(requiredPosition, "Sound fixture"), Throws.TypeOf<FormatException>());
        }

        [Test]
        public void SoundResourcesAndOneActionAreExportedWithoutInvalidatingSpatialPreview()
        {
            var manifest = LuaBindingRegistry.DescribeTypes(typeof(AudioLuaApi));
            var animations = ScriptableObject.CreateInstance<CharacterAnimationCatalog>();
            var weather = ScriptableObject.CreateInstance<WeatherCatalog>();
            try
            {
                LuaBindingManifestExporter.PopulateResources(manifest, animations, Array.Empty<MemaoAnimationLibrary>(), _catalog, weather);
                Assert.That(manifest.resources["sound"].Single().id, Is.EqualTo("test:bell"));
                Assert.That(manifest.resources["sound"].Single().description, Is.EqualTo("Bell"));
                Assert.That(manifest.modules.Single().methods.Length, Is.EqualTo(1));
                foreach (var method in manifest.modules.Single().methods)
                {
                    Assert.That(method.action.execution, Is.EqualTo("immediate"));
                    Assert.That(method.action.phases, Is.EquivalentTo(new[] { "setup", "sequence", "completion" }));
                    Assert.That(method.parameters[0].resourceType, Is.EqualTo("sound"));
                    Assert.That(method.action.preview.spatialState, Is.EqualTo("described"));
                    Assert.That(method.action.preview.effects, Is.Empty);
                }
                var position = manifest.modules.Single().methods.Single().parameters[1];
                Assert.That(position.nullable, Is.True);
                Assert.That(position.picker, Is.EqualTo("mapPosition"));
                Assert.That(position.placementModes, Is.EquivalentTo(new[] { "tile", "pixel", "anchor" }));
            }
            finally { Object.DestroyImmediate(animations); Object.DestroyImmediate(weather); }
        }
    }

    public sealed class AudioTestSoundManager : MMSoundManager
    {
        public int Calls;
        public AudioClip Clip;
        public MMSoundManagerPlayOptions FirstOptions, Options;
        protected override void Awake() { }
        public override AudioSource PlaySound(AudioClip audioClip, MMSoundManagerPlayOptions options)
        {
            if (Calls++ == 0) FirstOptions = options;
            Clip = audioClip;
            Options = options;
            return null;
        }
    }
}
