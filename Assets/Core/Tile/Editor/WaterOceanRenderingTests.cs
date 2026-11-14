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
    public sealed class WaterOceanRenderingTests
    {
        private const int Size = 256; // Two screen pixels per logical pixel.

        private static Color32[] Render(float seconds, float storm = 0, Vector3 origin = default,
            Action<WaterProfile> configure = null)
        {
            var profile = Object.Instantiate(AssetDatabase.LoadAssetAtPath<WaterProfile>("Assets/Content/Water/Ocean_1.asset"));
            var root = new GameObject("Ocean render fixture");
            root.SetActive(false);
            root.transform.position = origin;
            var shoreline = ScriptableObject.CreateInstance<WaterShorelineData>();
            var distances = new Texture2DArray(128, 128, 1, TextureFormat.RFloat, false, true) { filterMode = FilterMode.Point };
            var pages = new Texture2D(1, 1, TextureFormat.RFloat, false, true) { filterMode = FilterMode.Point };
            var mask = new Texture2D(128, 128, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point };
            var mesh = new Mesh();
            var target = new RenderTexture(Size, Size, 0, RenderTextureFormat.ARGB32);
            var image = new Texture2D(Size, Size, TextureFormat.RGBA32, false);
            var commands = new CommandBuffer();
            var previous = RenderTexture.active;
            var oldTime = Shader.GetGlobalVector("_Time");
            var oldSea = Shader.GetGlobalFloat("_WaterSeaState");
            try
            {
                // Straight beach at x=16, including a transparent inland area. Distances
                // match the importer's pixel-centre convention: first water pixel is 1.
                distances.SetPixelData(Enumerable.Range(0, 128 * 128).Select(i => Mathf.Clamp(i % 128 - 15, 0, 32)).Select(v => (float)v).ToArray(), 0, 0);
                distances.Apply();
                pages.SetPixelData(new[] { 1f }, 0);
                pages.Apply();
                mask.SetPixels(Enumerable.Range(0, 128 * 128).Select(i => i % 128 >= 16 ? Color.white : Color.clear).ToArray());
                mask.Apply();
                shoreline.Configure(distances, pages, Vector2Int.zero, 32);
                profile.objectReflectionsEnabled = false;
                profile.interactionRipplesEnabled = profile.contactFoamEnabled = profile.rainSplashesEnabled = false;
                configure?.Invoke(profile);
                root.AddComponent<Grid>();
                root.AddComponent<WaterBody>().Configure(profile, 16, shoreline, null, Vector2.left);
                var properties = new MaterialPropertyBlock();
                root.GetComponent<TilemapRenderer>().GetPropertyBlock(properties);
                properties.SetTexture("_MainTex", mask);
                properties.SetColor("unity_SpriteColor", Color.white);
                properties.SetVector("unity_SpriteProps", Vector4.one);
                mesh.vertices = new[] { Vector3.zero, Vector3.right * 8, new Vector3(8,8,0), Vector3.up * 8 };
                mesh.uv = new[] { Vector2.zero, Vector2.right, Vector2.one, Vector2.up };
                mesh.colors = Enumerable.Repeat(Color.white, 4).ToArray();
                mesh.triangles = new[] { 0,1,2,0,2,3 };
                target.Create();
                commands.SetRenderTarget(target);
                commands.ClearRenderTarget(false, true, Color.clear);
                commands.SetViewProjectionMatrices(Matrix4x4.Translate(-origin), Matrix4x4.Ortho(0,8,0,8,-1,1));
                commands.SetGlobalVector("_Time", new Vector4(seconds / 20, seconds, seconds * 2, seconds * 3));
                commands.SetGlobalFloat("_WaterSeaState", storm);
                for (var i = 0; i < 4; i++) commands.DisableShaderKeyword("USE_SHAPE_LIGHT_TYPE_" + i);
                commands.DrawMesh(mesh, Matrix4x4.Translate(origin), profile.material, 0, 0, properties);
                for (var i = 0; i < 4; i++)
                    if (Shader.IsKeywordEnabled("USE_SHAPE_LIGHT_TYPE_" + i)) commands.EnableShaderKeyword("USE_SHAPE_LIGHT_TYPE_" + i);
                commands.SetGlobalVector("_Time", oldTime);
                commands.SetGlobalFloat("_WaterSeaState", oldSea);
                Graphics.ExecuteCommandBuffer(commands);
                RenderTexture.active = target;
                image.ReadPixels(new Rect(0,0,Size,Size), 0, 0);
                image.Apply();
                Assert.That(ShaderUtil.ShaderHasError(profile.material.shader), Is.False);
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
                Object.DestroyImmediate(mask);
                Object.DestroyImmediate(mesh);
                Object.DestroyImmediate(target);
                Object.DestroyImmediate(image);
            }
        }

        [Test]
        public void AuthoredOceanPreservesTheMaskAndAnimatesInSteps()
        {
            var first = Render(0);
            var sameTick = Render(0.01f);
            var later = Render(1.5f);
            Assert.That(sameTick, Is.EqualTo(first), "Animation must hold between authored animation ticks.");
            Assert.That(first.Where((_, i) => i % Size < 32).All(p => p.a == 0), Is.True, "Land must stay transparent.");
            Assert.That(first.Where((_, i) => i % Size >= 96).All(p => p.a == 255), Is.True, "Water beyond the beach slope must remain opaque.");
            Assert.That(first.Zip(later, (a,b) => !a.Equals(b)).Count(changed => changed), Is.GreaterThan(500));
            Assert.That(first.Select(p => (p.r, p.g, p.b)).Distinct().Count(), Is.GreaterThan(8), "Depth and waves must actually render.");
        }

        [Test]
        public void StormChangesTheSurfaceWithoutChangingTheWaterMask()
        {
            var calm = Render(1.5f);
            var storm = Render(1.5f, 1);
            Assert.That(storm.Where((_, i) => i % Size < 32).All(p => p.a == 0), Is.True);
            Assert.That(storm.Where((_, i) => i % Size >= 96).All(p => p.a == 255), Is.True);
            Assert.That(calm.Zip(storm, (a,b) => !a.Equals(b)).Count(changed => changed), Is.GreaterThan(500));
        }

        [Test]
        public void DepthFollowsTheBodyWhenTheMapIsRepositioned()
        {
            void DepthOnly(WaterProfile p)
            {
                p.swellEnabled = false;
                p.foamEnabled = false;
                p.depthWobblePixels = 0;
                p.causticIntensity = 0;
            }
            var first = Render(0, configure: DepthOnly);
            var moved = Render(0, origin: new Vector3(-13.25f, 7.125f, 0), configure: DepthOnly);
            Assert.That(moved, Is.EqualTo(first), "Baked shoreline depth must follow the map, not the renderer's batching matrix.");
        }

        [Test]
        public void BeachSlopeRevealsGroundOnlyInsideTheWaterMask()
        {
            var sloped = Render(0, configure: p => { p.oceanBeachSlopePixels = 12; p.foamEnabled = false; });
            var hard = Render(0, configure: p => { p.oceanBeachSlopePixels = 0; p.foamEnabled = false; });
            Assert.That(sloped.Where((_, i) => i % Size < 32).All(p => p.a == 0), Is.True);
            Assert.That(sloped.Count(p => p.a > 0 && p.a < 255), Is.GreaterThan(1000));
            Assert.That(sloped.Where((_, i) => i % Size >= 58).All(p => p.a == 255), Is.True);
            Assert.That(hard.Where((_, i) => i % Size >= 32).All(p => p.a == 255), Is.True);
        }

        [Test]
        public void CausticsLightOpenWaterWithoutChangingOpacityOrTheBeachSlope()
        {
            var off = Render(0, configure: p => { p.causticIntensity = 0; p.oceanBeachSlopePixels = 12; });
            var on = Render(0, configure: p => { p.causticIntensity = 0.6f; p.oceanBeachSlopePixels = 12; });
            Assert.That(on.Select(p => p.a), Is.EqualTo(off.Select(p => p.a)));
            Assert.That(on.Where((_, i) => i % Size < 54), Is.EqualTo(off.Where((_, i) => i % Size < 54)));
            Assert.That(off.Zip(on, (a,b) => !a.Equals(b)).Where((_, i) => i % Size >= 96).Count(changed => changed), Is.GreaterThan(300));
        }

        [Test]
        public void WobbleMovesTheSurfaceWithoutMovingTheBeachSlope()
        {
            void Stationary(WaterProfile p)
            {
                p.causticIntensity = 0;
                p.foamEnabled = false;
                p.swellSpeed = 0;
                p.oceanWobblePixels = 0;
            }
            var still = Render(0, configure: Stationary);
            Assert.That(Render(1.5f, configure: Stationary), Is.EqualTo(still));
            var first = Render(0, configure: p => { Stationary(p); p.oceanWobblePixels = 2; });
            var later = Render(1.5f, configure: p => { Stationary(p); p.oceanWobblePixels = 2; });
            Assert.That(later.Select(p => p.a), Is.EqualTo(first.Select(p => p.a)));
            Assert.That(first.Zip(later, (a,b) => !a.Equals(b)).Count(changed => changed), Is.GreaterThan(300));
        }
    }
}
