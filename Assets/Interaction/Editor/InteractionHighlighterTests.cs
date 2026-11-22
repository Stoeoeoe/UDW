using System;
using Core.Common.Editor;
using Interaction.Highlight;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using static Core.Common.Editor.Reflect;
using Object = UnityEngine.Object;

namespace Interaction.Editor
{
    /// <summary>The player's target is drawn with the outline material, and every sprite gets its own material back.</summary>
    public sealed class InteractionHighlighterTests : GameTest
    {
        private InteractionHighlighter _highlighter;
        private Material _spriteMaterial, _highlightMaterial;

        [SetUp]
        public void SetUp()
        {
            _highlighter = Game.Get<InteractionHighlighter>();
            Game.Root.SetActive(true); // Targets highlight only their active sprites.
            _highlightMaterial = Get<Material>(_highlighter, "highlightMaterial");
            _spriteMaterial = AssetDatabase.LoadAssetAtPath<Material>(
                "Packages/com.unity.render-pipelines.universal/Runtime/Materials/Sprite-Lit-Default.mat");
        }

        [Test]
        public void AuthoredHighlightMaterialUsesTheOutlineShader()
        {
            Assert.That(_highlightMaterial.shader.name, Is.EqualTo("UrdewValley/Interaction Outline"));
            Assert.That(ShaderUtil.ShaderHasError(_highlightMaterial.shader), Is.False);
        }

        [Test]
        public void TheOutlineIsToldTheSpritesOwnAreaInItsSheet()
        {
            var bench = Probe("Bench", out var sprite);
            var sheet = Game.Own(new Texture2D(64, 32));
            // A 30x25 slice of a larger sheet, as for the bench in the village tileset.
            sprite.sprite = Game.Own(Sprite.Create(sheet, new Rect(16, 0, 30, 25), new Vector2(0.5f, 0f), 16f, 0,
                SpriteMeshType.FullRect));

            _highlighter.Show(bench);

            var properties = new MaterialPropertyBlock();
            sprite.GetPropertyBlock(properties);
            Assert.That(properties.GetVector("_SpriteUVRect"), Is.EqualTo(new Vector4(16f / 64, 0, 46f / 64, 25f / 32)));
            Assert.That(properties.GetVector("_SpriteTexelSize"), Is.EqualTo(new Vector4(1f / 64, 1f / 32, 1f / 16, 1f / 16)));
            var local = sprite.sprite.bounds;
            Assert.That(properties.GetVector("_SpriteLocalRect"),
                Is.EqualTo(new Vector4(local.min.x, local.min.y, local.max.x, local.max.y)));
        }

        [Test]
        public void OnlyTheCurrentTargetsSpritesAreHighlighted()
        {
            var chest = Probe("Chest", out var chestSprite);
            var stall = Probe("Stall", out var stallSprite);

            _highlighter.Show(chest);
            Assert.That(chestSprite.sharedMaterial, Is.SameAs(_highlightMaterial));
            Assert.That(stallSprite.sharedMaterial, Is.SameAs(_spriteMaterial));

            _highlighter.Show(stall);
            Assert.That(chestSprite.sharedMaterial, Is.SameAs(_spriteMaterial));
            Assert.That(stallSprite.sharedMaterial, Is.SameAs(_highlightMaterial));

            _highlighter.Show(null);
            Assert.That(stallSprite.sharedMaterial, Is.SameAs(_spriteMaterial));
        }

        [Test]
        public void SpritesTheTargetGainsOrLosesFollowTheHighlight()
        {
            var crop = Probe("Crop", out var seedling);
            _highlighter.Show(crop);

            // A growth stage replaces the visual while the crop stays the target.
            seedling.gameObject.SetActive(false);
            var grown = new GameObject("Grown").AddComponent<SpriteRenderer>();
            grown.sharedMaterial = _spriteMaterial;
            grown.transform.SetParent(seedling.transform.parent, false);
            _highlighter.Show(crop);

            Assert.That(seedling.sharedMaterial, Is.SameAs(_spriteMaterial));
            Assert.That(grown.sharedMaterial, Is.SameAs(_highlightMaterial));
        }

        [Test]
        public void ADestroyedSpriteIsForgottenWithoutError()
        {
            var pickup = Probe("Pickup", out var sprite);
            _highlighter.Show(pickup);
            Object.DestroyImmediate(sprite.gameObject);
            Assert.DoesNotThrow(() => _highlighter.Show(null));
        }

        [Test]
        public void ASpriteWithAnotherMaterialFailsClearly()
        {
            var effect = Probe("Effect", out var sprite);
            var custom = Game.Own(new Material(Shader.Find("Sprites/Default")));
            sprite.sharedMaterial = custom;
            Assert.Throws<InvalidOperationException>(() => _highlighter.Show(effect));
            Assert.That(sprite.sharedMaterial, Is.SameAs(custom));
        }

        [Test]
        public void TargetsWithoutArtShowNoHighlight()
        {
            var door = Probe("Door", out var sprite);
            Set(door, "target", null);
            _highlighter.Show(door);
            Assert.That(sprite.sharedMaterial, Is.SameAs(_spriteMaterial));
        }

        private TargetingProbe Probe(string name, out SpriteRenderer sprite)
        {
            var root = new GameObject(name);
            root.SetActive(false);
            root.transform.SetParent(Game.Root.transform);
            root.AddComponent<BoxCollider2D>().isTrigger = true;
            var art = new GameObject("Art");
            art.transform.SetParent(root.transform, false);
            sprite = new GameObject("Sprite").AddComponent<SpriteRenderer>();
            sprite.transform.SetParent(art.transform, false);
            sprite.sharedMaterial = _spriteMaterial;
            var probe = Game.Add<TargetingProbe>(root);
            Set(probe, "target", art.transform);
            root.SetActive(true);
            return probe;
        }
    }
}
