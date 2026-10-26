using System;
using System.Linq;
using System.Reflection;
using Core.Camera;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using Unity.Cinemachine;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Scripting.Editor
{
    public sealed class CameraLuaApiTests
    {
        private GameObject _root;
        private CameraManager _manager;
        private CinemachineCamera _camera;

        [SetUp]
        public void SetUp()
        {
            _root = new GameObject("Camera shake fixture");
            _root.SetActive(false);
            _manager = _root.AddComponent<CameraManager>();
            var child = new GameObject("Follow camera");
            child.transform.SetParent(_root.transform);
            _camera = child.AddComponent<CinemachineCamera>();
            _camera.Follow = _root.transform;
            typeof(CameraManager).GetField("playerFollowVCam", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(_manager, _camera);
        }

        [TearDown] public void TearDown() => Object.DestroyImmediate(_root);

        private void Advance(float seconds) => typeof(CameraManager).GetMethod("AdvanceShake", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(_manager, new object[] { seconds });

        private Vector3 Correction(CinemachineCamera camera)
        {
            var state = CameraState.Default;
            state.RawOrientation = Quaternion.identity;
            camera.GetComponent<ScreenShakeExtension>().InvokePostPipelineStageCallback(camera, CinemachineCore.Stage.Noise, ref state, 0);
            return state.PositionCorrection;
        }

        [Test]
        public void ShakeUsesTransientCorrectionAndEndsWithoutMovingTheFollowTarget()
        {
            var original = _camera.transform.position;
            new CameraLuaApi(_manager).Shake(0.5, 0.2);
            Advance(0.1f);
            Assert.That(Correction(_camera).sqrMagnitude, Is.GreaterThan(0));
            Assert.That(_camera.transform.position, Is.EqualTo(original));
            Assert.That(_camera.Follow, Is.SameAs(_root.transform));
            Advance(0.4f);
            Assert.That(Correction(_camera), Is.EqualTo(Vector3.zero));
            Assert.That(_camera.transform.position, Is.EqualTo(original));
        }

        [Test]
        public void ActivatedCutsceneCamerasShareShakeAndLocationLeaveClearsIt()
        {
            var child = new GameObject("Cutscene camera");
            child.transform.SetParent(_root.transform);
            var camera = child.AddComponent<CinemachineCamera>();
            _manager.ActivateVCam(camera);
            _manager.Shake(1, 0.2f);
            Advance(0.1f);
            Assert.That(Correction(camera), Is.EqualTo(Correction(_camera)));
            _manager.OnLocationLeave(null);
            Assert.That(Correction(camera), Is.EqualTo(Vector3.zero));
            _manager.Shake(1, 0.2f);
            _manager.Shake(0, 0.2f);
            Assert.That(Correction(camera), Is.EqualTo(Vector3.zero));
        }

        [Test]
        public void ActionCompilesAndStartsShakeWithoutWaitingOrInvalidatingSpatialPreview()
        {
            var source = JArray.Parse("[{ 'id':'rumble', 'action':'camera.shake', 'arguments': { 'durationSeconds':0.5, 'strength':0.1 } }]");
            var lua = CutsceneSequenceCompiler.Compile(source, "Camera fixture", out var steps);
            var api = new CameraLuaApi(_manager);
            var bindings = CutsceneBindings.BindSequence(steps, "cutscene", (typeof(CameraLuaApi), () => api));
            using var run = VulcanusLuaEngine.StartSession(bindings, lua, "Camera fixture");
            run.Tick(0);
            Assert.That(run.IsRunning, Is.False);
            Assert.That(Correction(_camera).sqrMagnitude, Is.GreaterThan(0));
            var method = LuaBindingRegistry.DescribeTypes(typeof(CameraLuaApi)).modules.Single().methods.Single(method => method.name == "Shake");
            Assert.That(method.action.id, Is.EqualTo("camera.shake"));
            Assert.That(method.action.execution, Is.EqualTo("immediate"));
            Assert.That(method.action.preview.spatialState, Is.EqualTo("described"));
            Assert.That(method.action.preview.effects, Is.Empty);
            source[0]["arguments"]["strength"] = -1;
            Assert.That(() => CutsceneSequenceCompiler.Compile(source, "Camera fixture"), Throws.TypeOf<FormatException>());
        }

        [Test]
        public void InvalidParametersAndMissingCameraFailBeforePlayback()
        {
            Assert.That(() => CameraLuaApi.ValidateShake(-1, 1), Throws.TypeOf<ArgumentOutOfRangeException>());
            Assert.That(() => CameraLuaApi.ValidateShake(1, double.NaN), Throws.TypeOf<ArgumentOutOfRangeException>());
            Assert.That(() => CameraLuaApi.ValidateShake(double.PositiveInfinity, 1), Throws.TypeOf<ArgumentOutOfRangeException>());
            Assert.That(() => new CameraLuaApi(null), Throws.InvalidOperationException);
            typeof(CameraManager).GetField("playerFollowVCam", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(_manager, null);
            Assert.That(() => new CameraLuaApi(_manager), Throws.InvalidOperationException);
        }

        private UnityEngine.UI.Image FlashImage => _root.GetComponentInChildren<UnityEngine.UI.Image>(true);
        private void AdvanceFlash(float seconds) => typeof(CameraManager)
            .GetMethod("AdvanceFlash", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(_manager, new object[] { seconds });

        [Test]
        public void FlashFadesHoldsAndClearsWithQuadraticEasingAndStretchedPhases()
        {
            // The 1:2:1 phase times are scaled to a two-second total.
            new CameraLuaApi(_manager).Flash("#FF000080", 2, 1, 2, 1);
            var image = FlashImage;
            Assert.That(image.raycastTarget, Is.False);
            Assert.That(image.transform.parent.GetComponent<Canvas>().renderMode, Is.EqualTo(RenderMode.ScreenSpaceOverlay));
            Assert.That(image.color.a, Is.Zero);
            AdvanceFlash(0.125f); // Quarter of the fade-in: quadratic InOut = 0.125.
            Assert.That(image.color.a, Is.EqualTo(128f / 255 * 0.125f).Within(0.0001));
            AdvanceFlash(0.375f);
            Assert.That(image.color, Is.EqualTo(new Color(1, 0, 0, 128f / 255)));
            AdvanceFlash(1);
            Assert.That(image.color.a, Is.EqualTo(128f / 255).Within(0.0001));
            AdvanceFlash(0.375f);
            Assert.That(image.color.a, Is.EqualTo(128f / 255 * 0.125f).Within(0.0001));
            AdvanceFlash(0.125f);
            Assert.That(image.enabled, Is.False);
        }

        [Test]
        public void NewFlashReplacesPreviousAndZeroLengthFadesAreInstant()
        {
            var api = new CameraLuaApi(_manager);
            api.Flash();
            AdvanceFlash(0.1f);
            api.Flash("blue", 1, 0, 1, 0);
            Assert.That(_root.GetComponentsInChildren<UnityEngine.UI.Image>(true), Has.Length.EqualTo(1));
            Assert.That(FlashImage.color, Is.EqualTo(Color.blue));
            AdvanceFlash(1);
            Assert.That(FlashImage.enabled, Is.False);
            api.Flash("white", 0);
            Assert.That(FlashImage.enabled, Is.False);
        }

        [Test]
        public void FlashActionDefaultsCompileAndLuaContinuesImmediately()
        {
            var source = JArray.Parse("[{ 'id':'flash', 'action':'camera.flash', 'arguments': {} }]");
            var lua = CutsceneSequenceCompiler.Compile(source, "Flash fixture", out var steps);
            var api = new CameraLuaApi(_manager);
            var bindings = CutsceneBindings.BindSequence(steps, "cutscene", (typeof(CameraLuaApi), () => api));
            using var run = VulcanusLuaEngine.StartSession(bindings, lua, "Flash fixture");
            run.Tick(0);
            Assert.That(run.IsRunning, Is.False);
            Assert.That(FlashImage.enabled, Is.True);
            AdvanceFlash(0.05f);
            Assert.That(FlashImage.color, Is.EqualTo(Color.white));
            var method = bindings.Describe().modules.Single().methods.Single(method => method.name == "Flash");
            Assert.That(method.action.execution, Is.EqualTo("immediate"));
            Assert.That(method.action.preview.effects, Is.Empty);
            Assert.That(method.parameters.All(parameter => parameter.optional == true), Is.True);

            using var direct = VulcanusLuaEngine.StartSession(bindings, "Camera.Flash(); Camera.Flash('red', 0.5, 0, 1, 0)", "Direct flash");
            direct.Tick(0);
            Assert.That(direct.IsRunning, Is.False);
            Assert.That(FlashImage.color, Is.EqualTo(Color.red));
        }

        [TestCase("not-a-color", 1, 0.05, 1, 0.05)]
        [TestCase("white", -1, 0.05, 1, 0.05)]
        [TestCase("white", 1, -1, 1, 0.05)]
        [TestCase("white", 1, 0, 0, 0)]
        [TestCase("white", double.NaN, 0.05, 1, 0.05)]
        [TestCase("white", 1, 0.05, double.PositiveInfinity, 0.05)]
        public void InvalidFlashArgumentsFailDuringAuthoring(string color, double duration, double easeIn, double hold, double easeOut)
        {
            var source = new JArray(new JObject
            {
                ["id"] = "invalid-flash", ["action"] = "camera.flash",
                ["arguments"] = new JObject { ["color"] = color, ["durationSeconds"] = duration,
                    ["easeInSeconds"] = easeIn, ["holdSeconds"] = hold, ["easeOutSeconds"] = easeOut }
            });
            Assert.That(() => CutsceneSequenceCompiler.Compile(source, "Flash fixture"), Throws.TypeOf<FormatException>());
        }
    }
}
