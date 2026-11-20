using System.Collections.Generic;
using System.Linq;
using Core.Common.Editor;
using Core.Tile.Editor.Vulcanus;
using NUnit.Framework;

namespace Core.Quests.Editor
{
    public sealed class QuestCatalogValidationTests : GameTest
    {
        private static Dictionary<string, HashSet<string>> Known() => new() { ["base:map-1"] = new HashSet<string> { "temple" } };

        private QuestDefinition Quest(string giver, string objectives) => VulcanusJson.Populate(Game.Asset<QuestDefinition>(),
            $"{{ id: 'base:festival_wine', giver: '{giver}', steps: [{{ id: 'bring', objectives: [{objectives}] }}] }}");

        [Test]
        public void KnownReferencesPass()
        {
            var quest = Quest("base:fabia", @"
                { id: 'ask', kind: 'talk', character: 'base:fabia', dialogue: 'base:fabia_greeting' },
                { id: 'give', kind: 'deliver', character: 'base:fabia', item: 'base:wine', count: 2 },
                { id: 'go', kind: 'reach', map: 'base:map-1', trigger: 'temple' }");
            Assert.That(QuestCatalogValidation.Problems(quest, Known()), Is.Empty);
        }

        [Test]
        public void UnknownMapsAndTriggersAreReportedWithTheirPlace()
        {
            var quest = Quest("base:fabia", @"
                { id: 'go', kind: 'reach', map: 'base:map-1', trigger: 'harbour' },
                { id: 'sail', kind: 'reach', map: 'base:island' }");
            Assert.That(QuestCatalogValidation.Problems(quest, Known()).ToArray(), Is.EqualTo(new[]
            {
                "Quest 'base:festival_wine': objective 'go' of step 'bring' uses the unknown trigger 'harbour' on map 'base:map-1'.",
                "Quest 'base:festival_wine': objective 'sail' of step 'bring' goes to the unknown map 'base:island'."
            }));
        }

        [Test]
        public void AnUnknownStartMapIsReported()
        {
            var quest = VulcanusJson.Populate(Game.Asset<QuestDefinition>(),
                "{ id: 'base:festival_wine', start: { when: [{ on: 'locationChanged', map: 'base:island' }, { on: 'locationChanged', map: 'base:map-1' }] }, steps: [{ id: 'bring', objectives: [{ id: 'x', kind: 'condition' }] }] }");
            Assert.That(QuestCatalogValidation.Problems(quest, Known()).ToArray(), Is.EqualTo(new[]
            {
                "Quest 'base:festival_wine': it starts on entering the unknown map 'base:island'."
            }));
        }
    }
}
