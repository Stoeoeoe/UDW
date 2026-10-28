using System.Reflection;
using NUnit.Framework;
using Unity.Cinemachine;
using UnityEngine;
using UnityEngine.Rendering.Universal;
using Object = UnityEngine.Object;

namespace Core.Camera.Editor
{
    public sealed class MapCameraFramingTests
    {
        private GameObject _root;
        private UnityEngine.Camera _output;
        private PixelPerfectCamera _pixels;
        private CinemachineCamera _camera;
        private CinemachineConfiner2D _confiner;
        private MapCameraFraming _framing;
        private BoxCollider2D _shape;

        [SetUp]
        public void SetUp()
        {
            _root = new GameObject("Map camera fixture");
            _output = _root.AddComponent<UnityEngine.Camera>();
            _output.orthographic = true;
            _pixels = _root.AddComponent<PixelPerfectCamera>();
            _pixels.assetsPPU = 16;
            _pixels.refResolutionX = 640;
            _pixels.refResolutionY = 360;
            _pixels.cropFrame = PixelPerfectCamera.CropFrame.None;
            _pixels.gridSnapping = PixelPerfectCamera.GridSnapping.PixelSnapping;
            _root.AddComponent<CinemachineBrain>();
            var child = new GameObject("Follow camera");
            child.transform.SetParent(_root.transform);
            _camera = child.AddComponent<CinemachineCamera>();
            child.AddComponent<CinemachinePixelPerfect>();
            _confiner = child.AddComponent<CinemachineConfiner2D>();
            _shape = _root.AddComponent<BoxCollider2D>();
            _shape.isTrigger = true;
            _confiner.BoundingShape2D = _shape;
            _framing = child.AddComponent<MapCameraFraming>();
            BindMap(32, 32);
        }

        [TearDown] public void TearDown() => Object.DestroyImmediate(_root);

        private void BindMap(float width, float height)
        {
            _shape.size = new Vector2(width, height);
            _shape.offset = _shape.size * 0.5f;
            _confiner.InvalidateBoundingShapeCache();
            _framing.Bind(_confiner, new Bounds(_shape.offset, _shape.size));
        }

        private CameraState Frame(int width, int height, Vector3 position, float size = 10)
        {
            // Exercise the package's actual pixel-size calculation without rendering a Game View.
            var internals = typeof(PixelPerfectCamera).GetField("m_Internal", BindingFlags.Instance | BindingFlags.NonPublic)
                .GetValue(_pixels);
            internals.GetType().GetMethod("CalculateCameraProperties", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(internals, new object[] { width, height });
            _output.aspect = (float)width / height;
            _output.orthographicSize = size;
            var state = CameraState.Default;
            state.Lens = LensSettings.FromCamera(_output);
            state.RawPosition = position;
            state.RawOrientation = Quaternion.identity;
            _framing.PrePipelineMutateCameraStateCallback(_camera, ref state, -1);
            Assert.That(state.Lens.OrthographicSize, Is.EqualTo(size), "Confinement must not change the authored lens.");
            var lens = state.Lens;
            lens.OrthographicSize = _pixels.CorrectCinemachineOrthoSize(lens.OrthographicSize);
            state.Lens = lens;
            _confiner.InvokePostPipelineStageCallback(_camera, CinemachineCore.Stage.Body, ref state, -1);
            _framing.InvokePostPipelineStageCallback(_camera, CinemachineCore.Stage.Aim, ref state, -1);
            return state;
        }

        [Test]
        public void SystemCameraUsesTheFullViewportForFreeAspect()
        {
            var prefab = UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Resources/SystemRoot.prefab");
            var pixels = prefab.GetComponentInChildren<PixelPerfectCamera>(true);
            Assert.That(pixels.cropFrame, Is.EqualTo(PixelPerfectCamera.CropFrame.None));
            Assert.That(pixels.GetComponent<UnityEngine.Camera>().rect, Is.EqualTo(new Rect(0, 0, 1, 1)));
            var stack = pixels.GetComponent<UniversalAdditionalCameraData>().cameraStack;
            Assert.That(stack, Has.Count.EqualTo(1));
            Assert.That(stack[0].rect, Is.EqualTo(new Rect(0, 0, 1, 1)));
        }

        [TestCase(1171, 725)]
        [TestCase(1920, 1080)]
        [TestCase(2560, 1080)]
        [TestCase(800, 1000)]
        public void FreeAspectPreservesMapEdgesAtDifferentViewportSizes(int width, int height)
        {
            BindMap(100, 100);
            var state = Frame(width, height, new Vector3(0, 100, -10));
            AssertTopLeft(state);
        }

        [Test]
        public void NarrowMapCentersHorizontallyAndShowsItsTopEdgeWithoutZooming()
        {
            var state = Frame(1920, 1080, new Vector3(-5, 35, -10));
            Assert.That(state.Lens.OrthographicSize, Is.EqualTo(11.25f));
            Assert.That(state.GetFinalPosition().x, Is.EqualTo(16).Within(0.001));
            Assert.That(state.GetFinalPosition().y + state.Lens.OrthographicSize, Is.EqualTo(32).Within(0.001));
            Assert.That(_output.backgroundColor, Is.EqualTo(Color.black));
            Assert.That(_output.clearFlags, Is.EqualTo(CameraClearFlags.SolidColor));
        }

        [Test]
        public void ResizingReconfinesAgainstTheNewLensSize()
        {
            BindMap(100, 100);
            var position = new Vector3(0, 100, -10);
            var first = Frame(1280, 720, position, 7);
            var resized = Frame(1920, 1080, position, 7);
            Assert.That(resized.Lens.OrthographicSize, Is.Not.EqualTo(first.Lens.OrthographicSize));
            AssertTopLeft(first);
            AssertTopLeft(resized);
        }

        [Test]
        public void LargeMapShowsTheTopLeftCornerAtTheConfiguredZoom()
        {
            BindMap(100, 100);
            var state = Frame(1920, 1080, new Vector3(-5, 105, -10));
            Assert.That(state.Lens.OrthographicSize, Is.EqualTo(11.25f).Within(0.0001));
            AssertTopLeft(state);
        }

        [Test]
        public void MapSmallerOnBothAxesStaysCentered()
        {
            BindMap(8, 8);
            var state = Frame(1920, 1080, new Vector3(0, 8, -10));
            Assert.That(state.GetFinalPosition(), Is.EqualTo(new Vector3(4, 4, -10)));
            Assert.That(state.Lens.OrthographicSize, Is.EqualTo(11.25f));
        }

        [Test]
        public void ShortMapCentersVerticallyAndKeepsItsLeftEdgeVisible()
        {
            BindMap(100, 8);
            var state = Frame(1920, 1080, new Vector3(0, 8, -10));
            Assert.That(state.GetFinalPosition().y, Is.EqualTo(4).Within(0.001));
            Assert.That(state.GetFinalPosition().x - state.Lens.OrthographicSize * state.Lens.Aspect,
                Is.EqualTo(0).Within(0.001));
        }

        [Test]
        public void EmptyMapBoundsFailAtBinding()
        {
            Assert.That(() => _framing.Bind(_confiner, default), Throws.InvalidOperationException);
        }

        [Test]
        public void DisabledPixelCameraFailsAtBinding()
        {
            _pixels.enabled = false;
            Assert.That(() => _framing.Bind(_confiner, new Bounds(Vector3.zero, new Vector3(32, 32, 0))),
                Throws.InvalidOperationException);
        }

        private static void AssertTopLeft(CameraState state)
        {
            var center = state.GetFinalPosition();
            var halfHeight = state.Lens.OrthographicSize;
            var halfWidth = halfHeight * state.Lens.Aspect;
            Assert.That(center.x - halfWidth, Is.EqualTo(0).Within(0.001));
            Assert.That(center.y + halfHeight, Is.EqualTo(100).Within(0.001));
        }
    }
}
