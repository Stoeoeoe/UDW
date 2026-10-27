using System.Reflection;
using Core.Common.Editor;
using DG.Tweening;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Location.Editor
{
    /// <summary>Checks rendered mosaic coverage, pointer blocking and isolation of the authored material.</summary>
    public sealed class ScreenFaderTests
    {
        private GameObject _root;
        private UnityEngine.Camera _camera;
        private RenderTexture _target;
        private ScreenFader _fader;
        private UnityEngine.UI.Image _image;
        private CanvasGroup _group;
        private Texture2D _mask;

        [TearDown]
        public void TearDown()
        {
            if (_fader) GameTestFixture.Invoke(_fader, "OnDestroy");
            if (_root) Object.DestroyImmediate(_root);
            if (_target) { _target.Release(); Object.DestroyImmediate(_target); }
            if (_mask) Object.DestroyImmediate(_mask);
        }

        [TestCase(ScreenFader.MosaicOrder.Random)]
        [TestCase(ScreenFader.MosaicOrder.LeftToRight)]
        [TestCase(ScreenFader.MosaicOrder.CenterOut)]
        public void MosaicRendersClearPartialAndFullyCoveredFrames(ScreenFader.MosaicOrder order)
        {
            CreateFader(ScreenFader.Effect.Mosaic, order);
            _fader.ShowSceneImmediately();
            Assert.That(CountBlackPixels(), Is.Zero);
            var fade = _fader.FadeOut();
            fade.Goto(0.5f);
            var covered = CountBlackPixels();
            Assert.That(covered, Is.GreaterThan(0).And.LessThan(128 * 64));
            fade.Complete();
            Assert.That(CountBlackPixels(), Is.EqualTo(128 * 64));
            Assert.That(_group.blocksRaycasts, Is.True);
            _fader.FadeIn().Complete();
            Assert.That(CountBlackPixels(), Is.Zero);
            Assert.That(_group.blocksRaycasts, Is.False);
        }

        [Test]
        public void CutsceneFadeAndCenterRevealRestoreTheSharedFader()
        {
            CreateFader(ScreenFader.Effect.Iris, ScreenFader.MosaicOrder.Random);
            _fader.ShowSceneImmediately();
            var cover = _fader.CoverCutscene(1f);
            cover.Goto(0.5f);
            Assert.That(_group.alpha, Is.EqualTo(0.5f).Within(0.01f));
            cover.Complete();
            Assert.That(CountBlackPixels(), Is.EqualTo(128 * 64));
            var reveal = _fader.RevealCutscene(1f);
            reveal.Goto(0.2f);
            var frame = RenderPixels();
            Assert.That(frame[32 * 128 + 64].r, Is.GreaterThan(240), "The center opens first.");
            Assert.That(frame[64].r, Is.LessThan(16), "The bottom remains covered.");
            Assert.That(frame[63 * 128 + 64].r, Is.LessThan(16), "The top remains covered.");
            reveal.Complete();
            Assert.That(CountBlackPixels(), Is.Zero);
            Assert.That(_group.blocksRaycasts, Is.False);
            Assert.That(_image.enabled, Is.True);
            Assert.That(_image.material.HasProperty("_Progress"), Is.True);
            _fader.CoverCutscene(1f).Goto(0.5f);
            _fader.ShowSceneImmediately();
            Assert.That(CountBlackPixels(), Is.Zero);
            Assert.That(_group.blocksRaycasts, Is.False);
        }

        [Test]
        public void MosaicOwnsItsMaterialAndLeavesTheAuthoredAssetUnchanged()
        {
            CreateFader(ScreenFader.Effect.Mosaic, ScreenFader.MosaicOrder.Random);
            var authored = AssetDatabase.LoadAssetAtPath<Material>("Assets/Core/Location/ScreenWipe.mat");
            var originalProgress = authored.GetFloat("_Progress");
            Assert.That(_image.material, Is.Not.SameAs(authored));
            _fader.ShowSceneImmediately();
            Assert.That(_image.material.GetFloat("_Progress"), Is.Zero);
            Assert.That(authored.GetFloat("_Progress"), Is.EqualTo(originalProgress));
        }

        [TestCase(false)]
        [TestCase(true)]
        public void IrisClosesAroundAnOffCenterSubjectAndFullyRevealsAgain(bool useMask)
        {
            if (useMask)
            {
                _mask = new Texture2D(32, 32) { filterMode = FilterMode.Point };
                // A diamond proves the custom silhouette path, rather than the default circle.
                for (var y = 0; y < 32; y++)
                    for (var x = 0; x < 32; x++)
                        _mask.SetPixel(x, y, Mathf.Abs(x - 15.5f) + Mathf.Abs(y - 15.5f) < 14f ? Color.white : Color.clear);
                _mask.Apply();
            }
            CreateFader(ScreenFader.Effect.Iris, ScreenFader.MosaicOrder.Random);
            var subject = new GameObject("Off-center subject");
            subject.transform.SetParent(_root.transform);
            subject.transform.position = new Vector3(0.5f, -0.1f, 0f);
            _fader.ShowSceneImmediately();
            Assert.That(CountBlackPixels(), Is.Zero);
            var fade = _fader.FadeOut(subject.transform);
            fade.Goto(useMask ? 0.85f : 0.5f);
            var frame = RenderPixels();
            Assert.That(frame[26 * 128 + 96].r, Is.GreaterThan(240), "The subject must remain visible.");
            Assert.That(frame[0].r, Is.LessThan(16), "The area away from the subject must be black.");
            if (useMask)
            {
                // Diamond diagonals close sooner than its horizontal axis.
                Assert.That(frame[26 * 128 + 120].r, Is.GreaterThan(240));
                Assert.That(frame[44 * 128 + 114].r, Is.LessThan(16));
            }
            fade.Complete();
            Assert.That(CountBlackPixels(), Is.EqualTo(128 * 64));
            _fader.FadeIn(subject.transform).Complete();
            Assert.That(CountBlackPixels(), Is.Zero);
            Assert.That(_group.blocksRaycasts, Is.False);
        }

        private void CreateFader(ScreenFader.Effect effect, ScreenFader.MosaicOrder order)
        {
            _root = new GameObject("Fader rendering test");
            _target = new RenderTexture(128, 64, 24);
            _target.Create();
            var cameraObject = new GameObject("Preview camera");
            cameraObject.transform.SetParent(_root.transform);
            _camera = cameraObject.AddComponent<UnityEngine.Camera>();
            if (effect == ScreenFader.Effect.Iris) _camera.tag = "MainCamera";
            _camera.enabled = false;
            _camera.orthographic = true;
            _camera.orthographicSize = 0.5f;
            _camera.transform.position = new Vector3(0, 0, -10);
            _camera.clearFlags = CameraClearFlags.SolidColor;
            _camera.backgroundColor = Color.white;
            _camera.cullingMask = 1 << 31;
            _camera.targetTexture = _target;

            var canvasObject = new GameObject("Canvas", typeof(RectTransform), typeof(Canvas));
            canvasObject.layer = 31;
            canvasObject.transform.SetParent(_root.transform);
            var canvas = canvasObject.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            canvas.worldCamera = _camera;
            ((RectTransform)canvas.transform).sizeDelta = new Vector2(128, 64);
            canvas.transform.localScale = Vector3.one / 64f;

            var overlay = new GameObject("Overlay", typeof(RectTransform), typeof(UnityEngine.UI.Image));
            overlay.layer = 31;
            overlay.transform.SetParent(canvas.transform, false);
            var rect = (RectTransform)overlay.transform;
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = rect.offsetMax = Vector2.zero;
            _image = overlay.GetComponent<UnityEngine.UI.Image>();
            _image.color = Color.black;
            _fader = overlay.AddComponent<ScreenFader>();
            Set("_effect", effect);
            Set("_mosaicOrder", order);
            Set("_wipeMaterial", AssetDatabase.LoadAssetAtPath<Material>("Assets/Core/Location/ScreenWipe.mat"));
            Set("_irisMask", _mask);
            Set("_tileSize", 16f);
            Set("_duration", 1f);
            Set("_ease", Ease.Linear);
            GameTestFixture.Invoke(_fader, "Awake");
            _group = overlay.GetComponent<CanvasGroup>();
        }

        private int CountBlackPixels()
        {
            var count = 0;
            foreach (var pixel in RenderPixels()) if (pixel.r < 128) count++;
            return count;
        }

        private Color32[] RenderPixels()
        {
            Canvas.ForceUpdateCanvases();
            _camera.Render();
            var previous = RenderTexture.active;
            var pixels = new Texture2D(128, 64, TextureFormat.RGB24, false);
            try
            {
                RenderTexture.active = _target;
                pixels.ReadPixels(new Rect(0, 0, 128, 64), 0, 0);
                pixels.Apply();
                return pixels.GetPixels32();
            }
            finally
            {
                RenderTexture.active = previous;
                Object.DestroyImmediate(pixels);
            }
        }

        private void Set(string name, object value) => typeof(ScreenFader)
            .GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(_fader, value);
    }

}
