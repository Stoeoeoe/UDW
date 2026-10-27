using System.Linq;
using Core.Tile.Water;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor
{
    public sealed class WaterShorelineRenderingTests
    {
        [Test]
        public void BatchedWorldVerticesUseTheWaterBodyTransformForShorelineSampling()
        {
            var root = new GameObject("Translated water fixture");
            root.SetActive(false);
            var profile = ScriptableObject.CreateInstance<WaterProfile>();
            var shoreline = ScriptableObject.CreateInstance<WaterShorelineData>();
            var distances = new Texture2DArray(128, 128, 1, TextureFormat.RFloat, false, true)
                { filterMode = FilterMode.Point };
            var pages = new Texture2D(1, 1, TextureFormat.RFloat, false, true)
                { filterMode = FilterMode.Point };
            var mesh = new Mesh();
            var target = new RenderTexture(16, 16, 0, RenderTextureFormat.ARGB32);
            var image = new Texture2D(16, 16, TextureFormat.RGBA32, false);
            var commands = new CommandBuffer();
            var previous = RenderTexture.active;
            try
            {
                var pixels = Enumerable.Repeat(32f, 128 * 128).ToArray();
                for (var y = 0; y < 128; y++)
                    for (var x = 0; x < 2; x++) pixels[y * 128 + x] = 1;
                distances.SetPixelData(pixels, 0, 0);
                distances.Apply();
                pages.SetPixelData(new[] { 1f }, 0);
                pages.Apply();
                shoreline.Configure(distances, pages, Vector2Int.zero, 32);
                profile.material = AssetDatabase.LoadAssetAtPath<WaterProfile>("Assets/Content/Water/Lake_1.asset").material;
                profile.deepColor = profile.baseColor = profile.waveColor = Color.blue;
                profile.highlightColor = Color.red;
                profile.causticIntensity = 0;
                profile.shorelineEnabled = true;
                profile.foamWidth = 2;
                profile.foamIntensity = 0.5f; // The bank row doubles coverage, so it must always be visible.
                profile.shoreWavesEnabled = false;
                var origin = new Vector3(10.03125f, -3.15625f, 0);
                root.transform.position = origin;
                root.AddComponent<UnityEngine.Grid>();
                var body = root.AddComponent<WaterBody>();
                body.Configure(profile, 16, shoreline);
                var properties = new MaterialPropertyBlock();
                root.GetComponent<UnityEngine.Tilemaps.TilemapRenderer>().GetPropertyBlock(properties);
                properties.SetTexture("_MainTex", Texture2D.whiteTexture);
                properties.SetColor("_RendererColor", Color.white);
                properties.SetColor("unity_SpriteColor", Color.white);
                properties.SetVector("unity_SpriteProps", Vector4.one);
                // Simulate batching: vertices already contain the map placement, draw matrix is identity.
                mesh.vertices = new[] { origin, origin + Vector3.right, origin + Vector3.one - Vector3.forward,
                    origin + Vector3.up };
                mesh.uv = new[] { Vector2.zero, Vector2.right, Vector2.one, Vector2.up };
                mesh.colors = Enumerable.Repeat(Color.white, 4).ToArray();
                mesh.triangles = new[] { 0, 1, 2, 0, 2, 3 };
                target.Create();
                commands.SetRenderTarget(target);
                commands.ClearRenderTarget(false, true, Color.black);
                commands.SetViewProjectionMatrices(Matrix4x4.identity,
                    Matrix4x4.Ortho(origin.x, origin.x + 1, origin.y, origin.y + 1, -1, 1));
                for (var i = 0; i < 4; i++) commands.DisableShaderKeyword("USE_SHAPE_LIGHT_TYPE_" + i);
                commands.DrawMesh(mesh, Matrix4x4.identity, profile.material, 0, 0, properties);
                for (var i = 0; i < 4; i++)
                    if (Shader.IsKeywordEnabled("USE_SHAPE_LIGHT_TYPE_" + i))
                        commands.EnableShaderKeyword("USE_SHAPE_LIGHT_TYPE_" + i);
                Graphics.ExecuteCommandBuffer(commands);
                RenderTexture.active = target;
                image.ReadPixels(new Rect(0, 0, 16, 16), 0, 0);
                image.Apply();
                Assert.That(image.GetPixel(0, 8).r, Is.GreaterThan(0.9f), "Bank pixels must draw foam.");
                Assert.That(image.GetPixel(8, 8).b, Is.GreaterThan(0.9f), "Interior pixels must retain the water color.");
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
    }
}
