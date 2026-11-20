using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Common.Editor;
using Core.Dialogue.Vulcanus;
using Core.Inventory;
using Core.Quests;
using Core.Routines;
using Core.Shops;
using Core.Tile.Editor.Vulcanus;
using NUnit.Framework;

namespace Core.Catalogs.Editor
{
    public sealed class ReferenceValidationTests : GameTest
    {
        private static readonly Dictionary<Type, string[]> Ids = new()
        {
            [typeof(CharacterDefinition)] = new[] { "base:fabia" },
            [typeof(VulcanusDialogueAsset)] = new[] { "base:Greeting" },
            [typeof(ItemDefinition)] = new[] { "base:wine" }
        };

        private static ReferenceValidation Known() => new(type => Ids.TryGetValue(type, out var ids) ? ids : Array.Empty<string>());

        [Test]
        public void ReferencesInNestedMembersNameTheirPlace()
        {
            var quest = VulcanusJson.Populate(Game.Asset<QuestDefinition>(), @"{ id: 'base:wine_quest', giver: 'base:nobody', steps: [{ id: 'bring', objectives: [
                { id: 'ask', kind: 'talk', character: 'base:fabia', dialogue: 'BASE:GREETING' },
                { id: 'carry', kind: 'have', item: 'base:amphora', count: 1 }] }] }");
            quest.name = "base:wine_quest"; // the importer names definitions by their ID
            Assert.That(Known().Problems(quest).ToArray(), Is.EqualTo(new[]
            {
                "QuestDefinition 'base:wine_quest': Giver uses the unknown CharacterDefinition 'base:nobody'.",
                "QuestDefinition 'base:wine_quest': Steps[0].Objectives[0].Dialogue uses the unknown VulcanusDialogueAsset 'BASE:GREETING'.",
                "QuestDefinition 'base:wine_quest': Steps[0].Objectives[1].Item uses the unknown ItemDefinition 'base:amphora'."
            }), "IDs match exactly, including case; empty references mean none, and map and trigger are not references.");
        }

        [Test]
        public void ShopsAndRoutinesAreCheckedThroughTheSameRule()
        {
            var shop = VulcanusJson.Populate(Game.Asset<Shop>(), "{ id: 'base:stall', name: 'Stall', offerings: [{ itemId: 'base:wine', price: 1 }, { itemId: 'base:amphora', price: 2 }] }");
            Assert.That(Known().Problems(shop).Single(), Does.Contain("Offerings[1].ItemId uses the unknown ItemDefinition 'base:amphora'"));

            var routine = VulcanusJson.Populate(Game.Asset<RoutineDefinition>(),
                @"{ id: 'base:fabia_day', character: 'base:nobody', home: { map: 'base:map', anchor: 'bed' },
                    variants: [{ id: 'default', goals: [{ id: 'out', departAt: '08:00', destination: 'home', walkingDialogue: 'base:missing' }] }] }");
            Assert.That(Known().Problems(routine).Select(problem => problem.Substring(problem.IndexOf(": ") + 2)), Is.EqualTo(new[]
            {
                "Character uses the unknown CharacterDefinition 'base:nobody'.",
                "Variants[0].Goals[0].WalkingDialogue.Id uses the unknown VulcanusDialogueAsset 'base:missing'."
            }));
        }
    }
}
