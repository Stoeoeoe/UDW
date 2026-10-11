using TestConfiguration = Core.Common.Editor.ConfigurationTestData;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Character;
using Core.Divinity;
using Core.Equipment;
using Core.Inventory;
using Core.Items;
using Core.Shops;
using Interaction.Dialog;
using Interaction.Tools;
using NUnit.Framework;
using Plants;
using Tools;
using UI.Shared;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace Core.Common.Editor
{
    [Category("ConfigurationValidation")]
    public sealed class ConfigurationValidatorTests
    {
        private readonly List<Object> _objects = new();

        [TearDown]
        public void Cleanup()
        {
            foreach (var instance in _objects) Object.DestroyImmediate(instance);
            _objects.Clear();
        }

        private T Asset<T>() where T : ValidatedScriptableObject
        {
            var asset = ScriptableObject.CreateInstance<T>();
            _objects.Add(asset);
            if (asset is ItemDefinition item) Set(item, "_itemId", "test:item");
            if (asset is EquipmentSlotDefinition slot) TestConfiguration.Set(slot, "_id", "test:head");
            if (asset is SkillDefinition skill) Set(skill, "_skillId", "test:skill");
            if (asset is DeityDefinition deity) Set(deity, "_id", "legacy-deity");
            if (asset is TypewriterSound sound) TestConfiguration.Set(sound, "_actorId", "Actor");
            if (asset is ToolData tool) TestConfiguration.Set(tool, "_toolEffectConfiguration", new ToolEffectConfiguration { AffectedTileOffsets = new[] { Vector2Int.up } });
            if (asset is SeedItem seed) TestConfiguration.Set(seed, "_plantData", AssetDatabase.LoadAssetAtPath<PlantData>("Assets/Plants/Lentils/LentilsPlantData.asset"));
            return asset;
        }

        [Test]
        public void ValidDefinitionsAndIntentionalEmptyConfigurationsPass()
        {
            var assets = new ValidatedScriptableObject[]
            {
                Asset<ProduceItem>(), Asset<ToolData>(), Asset<SeedItem>(), Asset<StaminaConsumableItem>(),
                Asset<WornEquipmentItem>(), Asset<InventoryConfiguration>(), Asset<EquipmentSlotDefinition>(),
                Asset<ShopDefinition>(), Asset<SkillDefinition>(), Asset<DeityDefinition>(), Asset<BoonDefinition>(),
                Asset<UISoundProfile>(), Asset<TypewriterSound>()
            };
            foreach (var asset in assets) Assert.That(asset.ValidateConfiguration(), Is.Empty, asset.GetType().Name);
        }

        [Test]
        public void ItemImportPopulatesInheritedAndSubtypeFieldsThroughReadOnlyGetters()
        {
            var item = Asset<StaminaConsumableItem>();
            Assert.That(Core.Tile.Editor.Vulcanus.VulcanusImportHelpers.TrySetMemberValue(
                item, "ItemId", "import:food"), Is.True);
            Assert.That(Core.Tile.Editor.Vulcanus.VulcanusImportHelpers.TryApplyPropertyToObject(
                item, "StaminaRestored", new Newtonsoft.Json.Linq.JValue(12f)), Is.True);
            Assert.That(item.ItemId, Is.EqualTo("import:food"));
            Assert.That(item.StaminaRestored, Is.EqualTo(12f));
            Assert.That(item.ValidateConfiguration(), Is.Empty);
        }

        [Test]
        public void ItemSubtypeHooksRunBothCommonAndSubtypeRulesWithoutFillingInIds()
        {
            var tool = Asset<ToolData>();
            Set(tool, "_itemId", " ");
            Set(tool, "_maxStackSize", 0);
            TestConfiguration.Set(tool, "_staminaCost", -1);
            TestConfiguration.Set(tool, "_actionDuration", float.NaN);
            TestConfiguration.Set(tool, "_toolEffectConfiguration", null);
            Assert.That(tool.ValidateConfiguration().Select(e => e.Setting),
                Does.Contain("_itemId").And.Contain("_maxStackSize").And.Contain("_staminaCost").And.Contain("_actionDuration")
                    .And.Contain("_toolEffectConfiguration"));
            Assert.That(tool.ItemId, Is.EqualTo(" "));
        }

        [Test]
        public void SeedAndConsumableRulesRejectMissingPlantAndNonpositiveEffect()
        {
            var seed = Asset<SeedItem>(); TestConfiguration.Set(seed, "_plantData", null);
            AssertError(seed, "_plantData");
            var consumable = Asset<StaminaConsumableItem>(); TestConfiguration.Set(consumable, "_staminaRestored", 0);
            AssertError(consumable, "_staminaRestored");
        }

        [Test]
        public void InventoryRejectsOverflowNegativeUpgradePriceAndDuplicateOrMissingSlots()
        {
            var inventory = Asset<InventoryConfiguration>();
            TestConfiguration.Set(inventory, "_columns", int.MaxValue); TestConfiguration.Set(inventory, "_startingRows", 2); TestConfiguration.Set(inventory, "_toolbeltSlots", 0);
            TestConfiguration.Set(inventory, "_upgrades", new[] { new InventoryConfiguration.Upgrade { Rows = 2, Price = -1 } });
            var slot = Asset<EquipmentSlotDefinition>();
            TestConfiguration.Set(inventory, "_equipmentSlots", new[] { slot, slot, null });
            AssertError(inventory, "_startingRows"); AssertError(inventory, "_toolbeltSlots");
            AssertError(inventory, "_upgrades[0].Rows"); AssertError(inventory, "_upgrades[0].Price");
            AssertError(inventory, "_equipmentSlots[1]._id"); AssertError(inventory, "_equipmentSlots[2]");
        }

        [Test]
        public void EquipmentChecksReferencedSlotIdsAndFiniteModifiers()
        {
            var item = Asset<WornEquipmentItem>();
            var slot = Asset<EquipmentSlotDefinition>(); TestConfiguration.Set(slot, "_id", "");
            TestConfiguration.Set(item, "_allowedSlots", new[] { slot });
            TestConfiguration.Set(item, "_modifiers", new[] { new WornEquipmentItem.Modifier { Attribute = (CharacterAttributeType)999, Percent = float.PositiveInfinity } });
            AssertError(item, "_allowedSlots[0]._id"); AssertError(item, "_modifiers[0].Attribute"); AssertError(item, "_modifiers[0].Percent");
        }

        [Test]
        public void ShopReportsIndependentOfferingErrorsTogether()
        {
            var shop = Asset<ShopDefinition>(); var item = Asset<ProduceItem>();
            Set(shop, "offerings", new[]
            {
                new ShopOffering { id = "same", item = item },
                new ShopOffering { id = "same", item = null, minStock = -1, maxStock = int.MaxValue,
                    priceMultiplier = float.NaN, dailyAppearanceChance = float.PositiveInfinity, restock = (ShopRestockMode)999 }
            });
            TestConfiguration.Set(shop, "_sellPriceMultiplier", -1);
            AssertError(shop, "_sellPriceMultiplier"); AssertError(shop, "offerings[1].id"); AssertError(shop, "offerings[1].item");
            AssertError(shop, "offerings[1].minStock"); AssertError(shop, "offerings[1].maxStock");
            AssertError(shop, "offerings[1].restock"); AssertError(shop, "offerings[1].priceMultiplier");
            AssertError(shop, "offerings[1].dailyAppearanceChance");
        }

        [Test]
        public void SoundProfileRejectsDuplicatesMissingClipsAndReversedRangesWithoutRepair()
        {
            var profile = Asset<UISoundProfile>();
            var malformed = new UISoundProfile.Sound { cue = UISoundCue.Click, clips = new AudioClip[] { null }, volume = 2,
                pitchRange = new Vector2(2, 1) };
            Set(profile, "sounds", new[] { new UISoundProfile.Sound { cue = UISoundCue.Click }, malformed });
            AssertError(profile, "sounds[1].cue"); AssertError(profile, "sounds[1].clips[0]");
            AssertError(profile, "sounds[1].volume"); AssertError(profile, "sounds[1].pitchRange");
            Assert.That(malformed.pitchRange, Is.EqualTo(new Vector2(2, 1))); Assert.That(malformed.volume, Is.EqualTo(2));
        }

        [Test]
        public void TypewriterPitchAndActorIdentityAreValidatedButSilenceIsAllowed()
        {
            var sound = Asset<TypewriterSound>(); TestConfiguration.Set(sound, "_pitchMin", 2); TestConfiguration.Set(sound, "_pitchMax", 1); TestConfiguration.Set(sound, "_actorId", " ");
            AssertError(sound, "_actorId"); AssertError(sound, "pitchMin/pitchMax");
        }

        [Test]
        public void SkillRejectsMissingLevelsInvalidGrantsAndInvalidModRegistration()
        {
            var skill = Asset<SkillDefinition>(); Set(skill, "levels", Array.Empty<SkillLevelDefinition>());
            AssertError(skill, "levels"); Assert.Throws<ArgumentException>(() => SkillDefinitions.Register(skill));
            var level = new SkillLevelDefinition(); Set(level, "value", float.NaN); Set(level, "grantedTags", new[] { "State..Broken" });
            Set(level, "attributeBonuses", new AttributeBonus[] { null }); Set(skill, "levels", new[] { level });
            AssertError(skill, "levels[0].value"); AssertError(skill, "levels[0].grantedTags[0]"); AssertError(skill, "levels[0].attributeBonuses[0]");
        }

        [Test]
        public void RequestedSkillLevelStillClampsAsRuntimeInput()
        {
            var skill = Asset<SkillDefinition>();
            Assert.That(skill.GetLevelDefinition(-1), Is.SameAs(skill.GetLevelDefinition(0)));
            Assert.That(skill.GetLevelDefinition(int.MaxValue), Is.SameAs(skill.GetLevelDefinition(0)));
        }

        [Test]
        public void DeityValidatesThresholdsBoonReferencesAndModRegistration()
        {
            var deity = Asset<DeityDefinition>(); Set(deity, "_dailyDecay", -1);
            var level = new FavourLevel(); Set(level, "requiredPoints", 0); Set(level, "boons", new BoonDefinition[] { null });
            Set(deity, "levels", new[] { level });
            AssertError(deity, "_dailyDecay"); AssertError(deity, "levels[0].requiredPoints"); AssertError(deity, "levels[0].boons[0]");
            Assert.Throws<ArgumentException>(() => DeityDefinitions.Register(deity));
        }

        [Test]
        public void BoonReportsNonfiniteAttributesAndInvalidGameplayTags()
        {
            var boon = Asset<BoonDefinition>(); var bonus = new AttributeBonus(); Set(bonus, "flat", float.NaN);
            Set(boon, "attributes", new[] { bonus }); Set(boon, "grantedTags", new[] { "none.Reserved" });
            AssertError(boon, "attributes[0].flat"); AssertError(boon, "grantedTags[0]");
        }

        [Test]
        public void InheritedItemEditHookReportsSubtypeRulesAndDoesNotMintAnId()
        {
            var item = Asset<StaminaConsumableItem>(); Set(item, "_itemId", ""); TestConfiguration.Set(item, "StaminaRestored", 0);
            foreach (var error in item.ValidateConfiguration()) LogAssert.Expect(LogType.Error, error.ToString());
            typeof(ValidatedScriptableObject).GetMethod("OnValidate", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(item, null);
            Assert.That(item.ItemId, Is.Empty); Assert.That(item.StaminaRestored, Is.Zero);
        }

        [Test]
        public void ProjectScanAndBuildHookIncludeUnreferencedMigratedAssets()
        {
            var folder = "Assets/__MigratedValidation_" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", folder.Substring("Assets/".Length));
            var path = folder + "/Inventory.asset";
            var config = Asset<InventoryConfiguration>();
            TestConfiguration.Set(config, "_columns", 0);
            var previousIgnore = LogAssert.ignoreFailingMessages;
            try
            {
                // Import reports the deliberately invalid fixture through the edit hook too.
                LogAssert.ignoreFailingMessages = true;
                AssetDatabase.CreateAsset(config, path);
                Assert.That(ValidatedAssetValidation.ValidateProject().Any(error =>
                    error.Asset == config && error.Setting == "_columns"), Is.True);
                var failure = Assert.Throws<BuildFailedException>(() =>
                    new ValidatedAssetValidation().OnPreprocessBuild(null));
                Assert.That(failure.Message, Does.Contain(path).And.Contain("_columns"));
            }
            finally
            {
                AssetDatabase.DeleteAsset(folder);
                _objects.Remove(config);
                if (config) Object.DestroyImmediate(config);
                LogAssert.ignoreFailingMessages = previousIgnore;
            }
        }

        private static void AssertError(ValidatedScriptableObject asset, string field) =>
            Assert.That(asset.ValidateConfiguration().Any(error => error.Setting == field), Is.True, asset.GetType().Name + ": " + field);

        private static void Set(object target, string name, object value)
        {
            for (var type = target.GetType(); type != null; type = type.BaseType)
            {
                var field = type.GetField(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
                if (field == null) continue;
                field.SetValue(target, value); return;
            }
            throw new ArgumentException(name);
        }
    }
}

namespace Core.Common.Editor
{
    // Author test configurations through the same private serialized storage used by the Inspector.
    internal static class ConfigurationTestData
    {
        public static void Set(object target, string member, object value)
        {
            for (var type = target.GetType(); type != null; type = type.BaseType)
            {
                const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly;
                var property = type.GetProperty(member, flags);
                if (property?.GetSetMethod(true) != null)
                {
                    property.SetValue(target, value);
                    return;
                }
                var field = type.GetField(member, flags)
                    ?? type.GetField("_" + char.ToLowerInvariant(member[0]) + member.Substring(1), flags);
                if (field != null)
                {
                    field.SetValue(target, value);
                    return;
                }
            }
            throw new ArgumentException($"No writable configuration member '{member}' on {target.GetType().Name}.");
        }
    }
}
