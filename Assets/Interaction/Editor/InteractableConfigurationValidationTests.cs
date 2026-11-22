using System.Linq;
using Core.Common.Editor;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using static Core.Common.Editor.Reflect;

namespace Interaction.Editor
{
    /// <summary>Interaction targeting setup is checked before play: layers, hoverable and outlinable art.</summary>
    public sealed class InteractableConfigurationValidationTests : GameTest
    {
        [Test]
        public void AuthoredPrefabsAndPlantsAreValid()
        {
            Assert.That(InteractableConfigurationValidation.CheckPrefabs(), Is.Empty);
        }

        [Test]
        public void AButtonPressInteractableOffTheInteractableLayerIsReported()
        {
            var root = Interactable(out _);
            root.layer = 0;
            Assert.That(InteractableConfigurationValidation.Check(root), Has.Exactly(1).Contains("Interactable layer"));
        }

        [Test]
        public void ArtWithoutReadWriteIsReported()
        {
            var root = Interactable(out var sprite);
            var texture = Game.Own(new Texture2D(16, 16));
            texture.Apply(false, makeNoLongerReadable: true);
            sprite.sprite = Game.Own(Sprite.Create(texture, new Rect(0, 0, 16, 16), Vector2.zero, 16f, 0, SpriteMeshType.FullRect));
            Assert.That(InteractableConfigurationValidation.Check(root), Has.Exactly(1).Contains("Read/Write"));
        }

        [Test]
        public void ArtOnAnotherMaterialIsReported()
        {
            var root = Interactable(out var sprite);
            sprite.sharedMaterial = Game.Own(new Material(Shader.Find("Sprites/Default")));
            Assert.That(InteractableConfigurationValidation.Check(root), Has.Exactly(1).Contains("default lit sprite material"));
        }

        [Test]
        public void ValidArtPasses()
        {
            Assert.That(InteractableConfigurationValidation.Check(Interactable(out _)), Is.Empty);
        }

        // A chest-like interactable: interaction trigger on the Interactable layer, readable one-quad art.
        private GameObject Interactable(out SpriteRenderer sprite)
        {
            var root = new GameObject("Chest", typeof(BoxCollider2D)) { layer = LayerMask.NameToLayer("Interactable") };
            root.SetActive(false);
            root.transform.SetParent(Game.Root.transform);
            sprite = new GameObject("Graphics").AddComponent<SpriteRenderer>();
            sprite.transform.SetParent(root.transform, false);
            sprite.sharedMaterial = AssetDatabase.LoadAssetAtPath<Material>(
                "Packages/com.unity.render-pipelines.universal/Runtime/Materials/Sprite-Lit-Default.mat");
            sprite.sprite = Game.Own(Sprite.Create(Game.Own(new Texture2D(16, 16)), new Rect(0, 0, 16, 16), Vector2.zero, 16f, 0,
                SpriteMeshType.FullRect));
            Set(Game.Add<TargetingProbe>(root), "target", root.transform);
            return root;
        }
    }
}
