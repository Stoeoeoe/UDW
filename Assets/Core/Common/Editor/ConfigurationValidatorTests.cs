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
using TestConfiguration = Core.Common.Editor.ConfigurationTestData;
using Object = UnityEngine.Object;

namespace Core.Common.Editor
{
    [Category("ConfigurationValidation")]
    public sealed class ConfigurationValidatorTests : GameTest
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
            if (asset is ItemDefinition item) Set(item, "itemId", "test:item");
            if (asset is EquipmentSlotDefinition slot) TestConfiguration.Set(slot, "_id", "test:head");
            if (asset is SkillDefinition skill) Set(skill, "_skillId", "test:skill");
            if (asset is DeityDefinition deity) Set(deity, "_id", "legacy-deity");
            if (asset is TypewriterSound sound) TestConfiguration.Set(sound, "_soundId", "test:sound");
            if (asset is ToolData tool) TestConfiguration.Set(tool, "toolEffectConfiguration", new ToolEffectConfiguration { AffectedTileOffsets = new[] { Vector2Int.up } });
            if (asset is SeedItem seed) TestConfiguration.Set(seed, "plantData", AssetDatabase.LoadAssetAtPath<PlantData>("Assets/Plants/Lentils/LentilsPlantData.asset"));
            return asset;
        }

        [Test]
        public void ValidDefinitionsAndIntentionalEmptyConfigurationsPass()
        {
            var assets = new ValidatedScriptableObject[]
            {
                Asset<ProduceItem>(), Asset<ToolData>(), Asset<SeedItem>(), Asset<StaminaConsumableItem>(),
                Asset<WornEquipmentItem>(), Asset<InventoryConfiguration>(), Asset<EquipmentSlotDefinition>(),
                Asset<SkillDefinition>(), Asset<DeityDefinition>(), Asset<BoonDefinition>(),
                Asset<UISoundProfile>(), Asset<TypewriterSound>()
            };
            foreach (var asset in assets) Assert.That(asset.ValidateConfiguration(), Is.Empty, asset.GetType().Name);
        }

        [Test]
        public void ItemSubtypeHooksRunBothCommonAndSubtypeRulesWithoutFillingInIds()
        {
            var tool = Asset<ToolData>();
            Set(tool, "itemId", " ");
            Set(tool, "maxStackSize", 0);
            TestConfiguration.Set(tool, "staminaCost", -1);
            TestConfiguration.Set(tool, "actionDuration", float.NaN);
            TestConfiguration.Set(tool, "toolEffectConfiguration", null);
            Assert.That(tool.ValidateConfiguration().Select(e => e.Setting),
                Does.Contain("itemId").And.Contain("maxStackSize").And.Contain("staminaCost").And.Contain("actionDuration")
                    .And.Contain("toolEffectConfiguration"));
            Assert.That(tool.ItemId, Is.EqualTo(" "));
        }

        [Test]
        public void SeedAndConsumableRulesRejectMissingPlantAndNonpositiveEffect()
        {
            var seed = Asset<SeedItem>(); TestConfiguration.Set(seed, "plantData", null);
            AssertError(seed, "plantData");
            var consumable = Asset<StaminaConsumableItem>(); TestConfiguration.Set(consumable, "staminaRestored", 0);
            AssertError(consumable, "staminaRestored");
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
            TestConfiguration.Set(item, "allowedSlots", new[] { slot });
            TestConfiguration.Set(item, "modifiers", new[] { new WornEquipmentItem.Modifier { Attribute = (CharacterAttributeType)999, Percent = float.PositiveInfinity } });
            AssertError(item, "allowedSlots[0]._id"); AssertError(item, "modifiers[0].Attribute"); AssertError(item, "modifiers[0].Percent");
        }

        [Test]
        public void ShopReportsDuplicateAndInvalidOfferingsTogether()
        {
            var shop = Asset<Shop>();
            Core.Tile.Editor.Vulcanus.VulcanusJson.Fill(shop,
                "{ offerings: [{ itemId: 'test:a', price: 1 }, { itemId: 'test:a', price: -1 }, { itemId: '', price: 1 }] }");
            AssertError(shop, "offerings[1].itemId"); AssertError(shop, "offerings[1].price"); AssertError(shop, "offerings[2].itemId");
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
        public void TypewriterPitchAndIdAreValidatedButSilenceIsAllowed()
        {
            var sound = Asset<TypewriterSound>(); TestConfiguration.Set(sound, "_pitchMin", 2); TestConfiguration.Set(sound, "_pitchMax", 1); TestConfiguration.Set(sound, "_soundId", "Actor");
            AssertError(sound, "_soundId"); AssertError(sound, "pitchMin/pitchMax");
        }

        [Test]
        public void SkillRejectsMissingLevelsInvalidGrantsAndInvalidModRegistration()
        {
            var skill = Asset<SkillDefinition>(); Set(skill, "levels", Array.Empty<SkillLevelDefinition>());
            AssertError(skill, "levels"); Assert.Throws<ArgumentException>(() => Game.Get<SkillDefinitions>().Register(skill));
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
            Assert.Throws<ArgumentException>(() => Game.Get<DeityDefinitions>().Register(deity));
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
            var item = Asset<StaminaConsumableItem>(); Set(item, "itemId", ""); TestConfiguration.Set(item, "StaminaRestored", 0);
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
                var camel = char.ToLowerInvariant(member[0]) + member.Substring(1);
                var field = type.GetField(member, flags) ?? type.GetField(camel, flags) ?? type.GetField("_" + camel, flags);
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
