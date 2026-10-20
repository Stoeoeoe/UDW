using System;
using Core.Tile.Water;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor
{
    [Category("MapLoading")]
    public sealed class WaterFlowMapTests
    {
        private WaterProfile profile;
        private Texture2D texture;

        [SetUp]
        public void SetUp()
        {
            profile = ScriptableObject.CreateInstance<WaterProfile>();
            profile.material = AssetDatabase.LoadAssetAtPath<WaterProfile>("Assets/Content/Water/Lake_1.asset").material;
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(profile);
            if (texture) Object.DestroyImmediate(texture);
        }

        [Test]
        public void UniformCurrentNeedsNoFlowMap()
        {
            profile.flowEnabled = true;
            Assert.That(profile.flowMap, Is.Null);
            Assert.DoesNotThrow(profile.Validate);
        }

        [TestCase(TextureFormat.RGB24)]
        [TestCase(TextureFormat.RGBA32)]
        public void LinearPointFilteredFlowDataNeedsNoCpuCopy(TextureFormat format)
        {
            texture = new Texture2D(4, 4, format, false, true)
            {
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp
            };
            texture.Apply(false, true);
            profile.flowMap = texture;
            profile.flowEnabled = true;
            Assert.That(texture.isReadable, Is.False);
            Assert.DoesNotThrow(profile.Validate);
        }

        [TestCase("sRGB")]
        [TestCase("filter")]
        [TestCase("wrapU")]
        [TestCase("wrapV")]
        [TestCase("mipmaps")]
        [TestCase("channels")]
        public void InvalidFlowDataFailsEvenWhileTheCurrentIsDisabled(string invalidSetting)
        {
            texture = new Texture2D(4, 4, invalidSetting == "channels" ? TextureFormat.R8 : TextureFormat.RGBA32,
                invalidSetting == "mipmaps", invalidSetting != "sRGB")
            {
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp
            };
            switch (invalidSetting)
            {
                case "filter": texture.filterMode = FilterMode.Bilinear; break;
                case "wrapU": texture.wrapModeU = TextureWrapMode.Repeat; break;
                case "wrapV": texture.wrapModeV = TextureWrapMode.Mirror; break;
            }
            profile.flowMap = texture;
            Assert.That(Assert.Throws<InvalidOperationException>(profile.Validate).Message, Does.Contain("flow map requires"));
        }

        [TestCase(0, 16)]
        [TestCase(16, -1)]
        [TestCase(float.NaN, 16)]
        [TestCase(16, float.PositiveInfinity)]
        public void InvalidFlowMapCoverageFailsAtTheProfileBoundary(float width, float height)
        {
            profile.flowMapWorldSize = new Vector2(width, height);
            Assert.That(Assert.Throws<InvalidOperationException>(profile.Validate).Message, Does.Contain("world size"));
        }

        [Test]
        public void NonfiniteFlowMapOriginFailsAtTheProfileBoundary()
        {
            profile.flowMapWorldOrigin = new Vector2(float.NaN, 0);
            Assert.Throws<InvalidOperationException>(profile.Validate);
        }
    }
}
