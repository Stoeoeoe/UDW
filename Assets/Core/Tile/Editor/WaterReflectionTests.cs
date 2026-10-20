using System;
using Core.Tile.Water;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor
{
    [Category("MapLoading")]
    public sealed class WaterReflectionTests
    {
        private GameObject root;
        private SpriteRenderer sprite;
        private WaterReflectionSource source;

        [SetUp]
        public void SetUp()
        {
            root = new GameObject("Valid reflection fixture");
            root.SetActive(false);
            sprite = root.AddComponent<SpriteRenderer>();
            source = root.AddComponent<WaterReflectionSource>();
        }

        [TearDown]
        public void TearDown() => Object.DestroyImmediate(root);

        [Test]
        public void SourceRequiresAnAuthoredAnchorAndVisuals()
        {
            Assert.Throws<InvalidOperationException>(source.Validate);
            Assert.Throws<InvalidOperationException>(() => source.Configure(null, new[] { sprite }));
            Assert.Throws<InvalidOperationException>(() => source.Configure(root.transform, Array.Empty<SpriteRenderer>()));
            Assert.Throws<InvalidOperationException>(() => source.Configure(root.transform, new SpriteRenderer[] { null }));
            Assert.Throws<InvalidOperationException>(() => source.Configure(root.transform, new[] { sprite, sprite }));
        }

        [Test]
        public void EmptyAnimatedVisualSlotsAreValidButUnsupportedDrawModesFailBeforeRendering()
        {
            Assert.That(sprite.sprite, Is.Null);
            source.Configure(root.transform, new[] { sprite });
            Assert.DoesNotThrow(source.Validate);
            sprite.drawMode = SpriteDrawMode.Tiled;
            Assert.Throws<InvalidOperationException>(source.Validate);
            sprite.drawMode = SpriteDrawMode.Simple;
            sprite.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
            Assert.Throws<InvalidOperationException>(source.Validate);
        }

        [Test]
        public void TwoActiveSourcesCannotOwnTheSameSpriteAndDisablingReleasesOwnership()
        {
            source.Configure(root.transform, new[] { sprite });
            root.SetActive(true);
            var other = new GameObject("Second valid source");
            other.SetActive(false);
            try
            {
                var otherSprite = other.AddComponent<SpriteRenderer>();
                var otherSource = other.AddComponent<WaterReflectionSource>();
                otherSource.Configure(other.transform, new[] { otherSprite });
                other.SetActive(true);
                Assert.That(Assert.Throws<InvalidOperationException>(() => otherSource.Configure(root.transform, new[] { sprite })).Message,
                    Does.Contain("belongs to both"));
                root.SetActive(false);
                Assert.DoesNotThrow(() => otherSource.Configure(root.transform, new[] { sprite }));
            }
            finally { Object.DestroyImmediate(other); }
        }
    }
}
