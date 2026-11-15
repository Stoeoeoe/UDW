using System;
using System.Linq;
using Core.Tile.Editor.Vulcanus;
using Core.Tile.Water;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Tilemaps;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor
{
    // Renders real pixels with the water shader at a fixed clock and sea state.
    public sealed class WaterSwellTests
    {
        private const int Size = 64; // 4 world units at 16 pixels per unit.
        private static readonly Color32 Crest = new(255, 0, 0, 255);
        private static readonly Color32 Trough = new(0, 255, 0, 255);
        private static readonly Color32 Foam = new(255, 255, 255, 255);

        private static Color32[] Render(Action<WaterProfile> configure, float seconds = 1, float seaState = 0,
            Vector2 mapDirection = default, Func<int, int, float> shoreDistance = null)
        {
            var root = new GameObject("Swell fixture");
            root.SetActive(false);
            var profile = ScriptableObject.CreateInstance<WaterProfile>();
            var shoreline = ScriptableObject.CreateInstance<WaterShorelineData>();
            var distances = new Texture2DArray(128, 128, 1, TextureFormat.RFloat, false, true) { filterMode = FilterMode.Point };
            var pages = new Texture2D(1, 1, TextureFormat.RFloat, false, true) { filterMode = FilterMode.Point };
            var mesh = new Mesh();
            var target = new RenderTexture(Size, Size, 0, RenderTextureFormat.ARGB32);
            var image = new Texture2D(Size, Size, TextureFormat.RGBA32, false);
            var commands = new CommandBuffer();
            var previous = RenderTexture.active;
            try
            {
                // Open water everywhere unless a test puts a shore in.
                var field = new float[128 * 128];
                for (var y = 0; y < 128; y++)
                    for (var x = 0; x < 128; x++) field[y * 128 + x] = shoreDistance?.Invoke(x, y) ?? 32;
                distances.SetPixelData(field, 0, 0);
                distances.Apply();
                pages.SetPixelData(new[] { 1f }, 0);
                pages.Apply();
                shoreline.Configure(distances, pages, Vector2Int.zero, 32);

                // Only the swell draws in the colours under test: ripples use red too, but as short dashes.
                profile.material = AssetDatabase.LoadAssetAtPath<WaterProfile>("Assets/Content/Water/Lake_1.asset").material;
                profile.baseColor = Color.blue;
                profile.deepColor = Trough;
                profile.waveColor = Crest;
                profile.highlightColor = Foam;
                profile.causticIntensity = 0;
                profile.swellEnabled = true;
                profile.swellWavelength = 16;
                profile.swellSpeed = 4;
                profile.swellBreakup = 0;
                profile.swellCrossStrength = 0;
                profile.swellMeander = 0;
                profile.swellRipple = 0;
                configure(profile);
                root.AddComponent<Grid>();
                root.AddComponent<WaterBody>().Configure(profile, 16, shoreline, null, mapDirection);
                var properties = new MaterialPropertyBlock();
                root.GetComponent<TilemapRenderer>().GetPropertyBlock(properties);
                properties.SetTexture("_MainTex", Texture2D.whiteTexture);
                properties.SetColor("_RendererColor", Color.white);
                properties.SetColor("unity_SpriteColor", Color.white);
                properties.SetVector("unity_SpriteProps", Vector4.one);
                mesh.vertices = new[] { Vector3.zero, Vector3.right * 4, new Vector3(4, 4, 0), Vector3.up * 4 };
                mesh.uv = new[] { Vector2.zero, Vector2.right, Vector2.one, Vector2.up };
                mesh.colors = Enumerable.Repeat(Color.white, 4).ToArray();
                mesh.triangles = new[] { 0, 1, 2, 0, 2, 3 };
                target.Create();
                commands.SetRenderTarget(target);
                commands.ClearRenderTarget(false, true, Color.black);
                commands.SetViewProjectionMatrices(Matrix4x4.identity, Matrix4x4.Ortho(0, 4, 0, 4, -1, 1));
                commands.SetGlobalVector("_Time", new Vector4(seconds / 20, seconds, seconds * 2, seconds * 3));
                commands.SetGlobalFloat("_WaterSeaState", seaState);
                for (var i = 0; i < 4; i++) commands.DisableShaderKeyword("USE_SHAPE_LIGHT_TYPE_" + i);
                commands.DrawMesh(mesh, Matrix4x4.identity, profile.material, 0, 0, properties);
                for (var i = 0; i < 4; i++)
                    if (Shader.IsKeywordEnabled("USE_SHAPE_LIGHT_TYPE_" + i))
                        commands.EnableShaderKeyword("USE_SHAPE_LIGHT_TYPE_" + i);
                Graphics.ExecuteCommandBuffer(commands);
                RenderTexture.active = target;
                image.ReadPixels(new Rect(0, 0, Size, Size), 0, 0);
                image.Apply();
                return image.GetPixels32();
            }
            finally
            {
                RenderTexture.active = previous;
                commands.Dispose();
                Object.DestroyImmediate(root);
                Object.DestroyImmediate(profile);
                Object.DestroyImmediate(shoreline);
                Object.DestroyImmediate(distances);
                Object.DestroyImmediate(pages);
                Object.DestroyImmediate(mesh);
                Object.DestroyImmediate(target);
                Object.DestroyImmediate(image);
            }
        }

        private static bool Matches(Color32[] pixels, int x, int y, Color32 color)
        {
            var p = pixels[y * Size + x];
            return Mathf.Abs(p.r - color.r) < 60 && Mathf.Abs(p.g - color.g) < 60 && Mathf.Abs(p.b - color.b) < 60;
        }

        // Rows (image y up) that are almost entirely crest: a crest line running east-west.
        private static int[] CrestRows(Color32[] pixels) =>
            Enumerable.Range(0, Size).Where(y => Enumerable.Range(0, Size).Count(x => Matches(pixels, x, y, Crest)) > Size * 3 / 4).ToArray();

        private static int[] CrestColumns(Color32[] pixels) =>
            Enumerable.Range(0, Size).Where(x => Enumerable.Range(0, Size).Count(y => Matches(pixels, x, y, Crest)) > Size * 3 / 4).ToArray();

        [Test]
        public void CrestsRunAcrossTheDirectionTheSwellTravels()
        {
            var pixels = Render(_ => { });
            var rows = CrestRows(pixels);
            // Crests fade in and out as they travel, so a 64-pixel view of a 16-pixel swell shows up to four.
            Assert.That(rows.Length, Is.InRange(2, 4));
            Assert.That(rows.Zip(rows.Skip(1), (a, b) => (b - a) % 16), Is.All.Zero, "Whole wavelengths apart.");
            Assert.That(CrestColumns(pixels), Is.Empty, "A northbound swell has east-west crests.");
        }

        [Test]
        public void EachCrestCastsAOnePixelTroughBehindIt()
        {
            var pixels = Render(_ => { });
            foreach (var row in CrestRows(pixels).Where(row => row > 0))
                Assert.That(Enumerable.Range(0, Size).Count(x => Matches(pixels, x, row - 1, Trough)), Is.GreaterThan(Size * 3 / 4),
                    "The row behind a northbound crest is the trough.");
        }

        [Test]
        public void CrestsAdvanceInWholePixelsAlongTheTravelDirection()
        {
            var before = CrestRows(Render(_ => { }, seconds: 1));
            var after = CrestRows(Render(_ => { }, seconds: 1.5f)); // Half a second at 4 pixels per second.
            Assert.That(after.Select(row => (row - 2 + Size) % 16).Distinct(), Is.EquivalentTo(before.Select(row => row % 16).Distinct()),
                "Every crest moved two pixels north.");
        }

        [Test]
        public void AMapDirectionOverridesTheProfiles()
        {
            var pixels = Render(_ => { }, mapDirection: Vector2.right);
            Assert.That(CrestColumns(pixels).Length, Is.EqualTo(4), "An eastbound swell has north-south crests.");
            Assert.That(CrestRows(pixels), Is.Empty);
        }

        [Test]
        public void BreakupLeavesGapsAlongCrests()
        {
            var pixels = Render(profile => profile.swellBreakup = 0.6f);
            Assert.That(CrestRows(pixels), Is.Empty, "No crest runs unbroken across the view.");
            Assert.That(pixels.Count(p => Mathf.Abs(p.r - 255) < 60 && p.g < 60), Is.GreaterThan(Size), "But crests are still there.");
        }

        [Test]
        public void MeanderCurvesCrestsInsteadOfRunningStraight()
        {
            var pixels = Render(profile => profile.swellMeander = 1);
            Assert.That(CrestRows(pixels), Is.Empty, "No crest stays on one row across the view.");
            // Every column still crosses a crest: they bend, they do not vanish.
            Assert.That(Enumerable.Range(0, Size).All(x => Enumerable.Range(0, Size).Any(y => Matches(pixels, x, y, Crest))), Is.True);
        }

        [Test]
        public void ARoughSeaAddsWhitecapsToCalmCrests()
        {
            var calm = Render(_ => { }, seaState: 0);
            var storm = Render(_ => { }, seaState: 1);
            int Foam(Color32[] pixels) => pixels.Count(p => p.r > 200 && p.g > 200 && p.b > 200);
            Assert.That(Foam(calm), Is.LessThan(Size), "A calm sea foams on only a few crest stretches.");
            Assert.That(Foam(storm), Is.GreaterThan(Foam(calm) * 4), "A storm caps far more crests with foam.");
        }

        [Test]
        public void CrestsBreakIntoFoamInTheSurfZone()
        {
            // Land along the left edge: distance from the shore grows to the right. The swell heads for the beach.
            // At this clock the crest lines lie at x = 11, 27, 43 and 59, so exactly one is inside the 12-pixel surf.
            var pixels = Render(profile => { profile.swellShoalPixels = 20; profile.surfPixels = 12; profile.surfWashPixels = 0; },
                shoreDistance: (x, _) => Mathf.Min(32, x + 0.5f), mapDirection: Vector2.left);
            int Foams(int from, int to) =>
                Enumerable.Range(from, to - from).Sum(x => Enumerable.Range(0, Size).Count(y => Matches(pixels, x, y, Foam)));
            var columns = CrestColumns(pixels);
            Assert.That(Foams(0, 12), Is.GreaterThan(Size / 2), "Near the shore crests are foam.");
            Assert.That(columns.Where(x => x < 12), Is.Empty, "No ordinary crest line reaches the beach.");
            Assert.That(columns.Count(x => x >= 24), Is.GreaterThan(0), "Out at sea they are ordinary crests.");
            Assert.That(Foams(24, Size), Is.LessThan(Size / 2), "Out at sea only a few crest stretches foam.");
        }

        [Test]
        public void SmoothFadesBlendCrestsAndFoamWhileHardShadingStaysOnThePalette()
        {
            int Colours(bool smooth) => Render(profile =>
            {
                profile.smoothFades = smooth;
                profile.swellBreakup = 0.4f;
                profile.surfWashPixels = 4;
            }, shoreDistance: (x, _) => Mathf.Min(32, x + 0.5f), mapDirection: Vector2.left)
                .Select(p => (p.r / 8, p.g / 8, p.b / 8)).Distinct().Count();
            Assert.That(Colours(false), Is.LessThanOrEqualTo(6), "Hard shading draws palette colours only.");
            Assert.That(Colours(true), Is.GreaterThan(12), "Smooth fades blend between them.");
        }

        [Test]
        public void WithSmoothFadesCrestsFadeOutBeforeTheShore()
        {
            // Blended crest pixels lie between the blue water and the red crest; pure red is a hard wavelet.
            var pixels = Render(profile =>
            {
                profile.smoothFades = true;
                profile.swellShading = 0;
                profile.swellShoalPixels = 20;
                profile.surfPixels = 6;
            }, shoreDistance: (x, _) => Mathf.Min(32, x + 0.5f), mapDirection: Vector2.left);
            int Crested(int from, int to) =>
                Enumerable.Range(from, to - from).Sum(x => Enumerable.Range(0, Size).Count(y => pixels[y * Size + x].r is > 40 and < 220));
            Assert.That(Crested(0, 3), Is.Zero, "At the shore the swell has faded away.");
            Assert.That(Crested(24, Size), Is.GreaterThan(Size), "Out at sea the crests are there.");
        }

        [TestCase(2f)]
        [TestCase(float.NaN)]
        public void InvalidSwellFailsAtTheProfileBoundary(float wavelength)
        {
            var profile = ScriptableObject.CreateInstance<WaterProfile>();
            try
            {
                profile.material = AssetDatabase.LoadAssetAtPath<WaterProfile>("Assets/Content/Water/Lake_1.asset").material;
                profile.swellEnabled = true;
                profile.swellWavelength = wavelength;
                Assert.That(Assert.Throws<InvalidOperationException>(profile.Validate).Message, Does.Contain("swell"));
            }
            finally { Object.DestroyImmediate(profile); }
        }

        [TestCase(null, 0f, 0f)]
        [TestCase("default", 0f, 0f)]
        [TestCase("north", 0f, 1f)]
        [TestCase("west", -1f, 0f)]
        [TestCase("southeast", 0.7071f, -0.7071f)]
        public void AMapSwellDirectionIsACompassPoint(string value, float x, float y)
        {
            var direction = WaterTilemapImporter.ParseSwellDirection(value);
            Assert.That(direction.x, Is.EqualTo(x).Within(1e-3));
            Assert.That(direction.y, Is.EqualTo(y).Within(1e-3));
        }

        [TestCase("North")]
        [TestCase("up")]
        public void AnUnknownSwellDirectionFailsTheImport(string value) =>
            Assert.Throws<FormatException>(() => WaterTilemapImporter.ParseSwellDirection(value));
    }
}
