using System;
using System.Linq;
using Core.Tile.Water;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Tilemaps;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor
{
    // Renders real pixels with the water shader: flowing water must lay its wavelets along the current.
    public sealed class WaterFlowOrientationTests
    {
        private const int Size = 64; // 4 world units at 16 pixels per unit.

        private static Color32[] Render(Action<WaterProfile> configure)
        {
            var root = new GameObject("Flowing water fixture");
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
                distances.SetPixelData(Enumerable.Repeat(32f, 128 * 128).ToArray(), 0, 0);
                distances.Apply();
                pages.SetPixelData(new[] { 1f }, 0);
                pages.Apply();
                shoreline.Configure(distances, pages, Vector2Int.zero, 32);
                profile.material = AssetDatabase.LoadAssetAtPath<WaterProfile>("Assets/Content/Water/Lake_1.asset").material;
                // Wavelets are the only red on blue water, so they are easy to find in the render.
                profile.deepColor = profile.baseColor = Color.blue;
                profile.waveColor = Color.red;
                profile.highlightColor = Color.blue;
                profile.causticIntensity = 0;
                profile.flowEnabled = true;
                configure(profile);
                root.AddComponent<Grid>();
                root.AddComponent<WaterBody>().Configure(profile, 16, shoreline);
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

        private static bool IsWave(Color32[] pixels, int x, int y) =>
            x >= 0 && y >= 0 && x < Size && y < Size && pixels[y * Size + x].r > 200 && pixels[y * Size + x].b < 100;

        // Wave pixels that have another wave pixel one step away in the given direction (image y points up).
        private static int Pairs(Color32[] pixels, int dx, int dy)
        {
            var count = 0;
            for (var y = 0; y < Size; y++)
                for (var x = 0; x < Size; x++)
                    if (IsWave(pixels, x, y) && IsWave(pixels, x + dx, y + dy)) count++;
            return count;
        }

        private static void AssertRunsAlong(Color32[] pixels, (int x, int y) along, (int x, int y) across)
        {
            var total = pixels.Count(pixel => pixel.r > 200 && pixel.b < 100);
            Assert.That(total, Is.GreaterThan(30), "The render must contain wavelets to measure.");
            var alongPairs = Pairs(pixels, along.x, along.y);
            var acrossPairs = Pairs(pixels, across.x, across.y);
            Assert.That(alongPairs, Is.GreaterThan(acrossPairs * 3), $"Dashes must run along {along}: {alongPairs} vs {acrossPairs} across.");
        }

        [TestCase(1f, 0f, 1, 0, 0, 1)]   // East: dashes are horizontal, as the patterns are drawn.
        [TestCase(-1f, 0f, 1, 0, 0, 1)]  // West.
        [TestCase(0f, 1f, 0, 1, 1, 0)]   // North: dashes turn to run vertically.
        [TestCase(0f, -1f, 0, 1, 1, 0)]  // South.
        [TestCase(1f, 1f, 1, 1, 1, -1)]  // North-east: dashes run along the rising diagonal.
        [TestCase(1f, -1f, 1, -1, 1, 1)] // South-east: along the falling diagonal.
        public void AUniformCurrentTurnsTheWaveletsAlongItsDirection(float x, float y, int ax, int ay, int bx, int by)
        {
            var pixels = Render(profile => profile.flowDirection = new Vector2(x, y));
            AssertRunsAlong(pixels, (ax, ay), (bx, by));
        }

        [Test]
        public void ADrawnFlowMapTurnsTheWaveletsAlongTheLocalCurrent()
        {
            var flowMap = new Texture2D(2, 2, TextureFormat.RGB24, false, true)
                { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
            try
            {
                flowMap.SetPixels32(Enumerable.Repeat(new Color32(128, 255, 255, 255), 4).ToArray()); // Due north at full speed.
                flowMap.Apply();
                var pixels = Render(profile =>
                {
                    profile.flowMap = flowMap;
                    profile.flowMapWorldOrigin = Vector2.zero;
                    profile.flowMapWorldSize = new Vector2(4, 4);
                });
                AssertRunsAlong(pixels, (0, 1), (1, 0));
            }
            finally { Object.DestroyImmediate(flowMap); }
        }

        [Test]
        public void StillWaterKeepsItsHorizontalWavelets()
        {
            var pixels = Render(profile => profile.flowEnabled = false);
            AssertRunsAlong(pixels, (1, 0), (0, 1));
        }
    }
}
