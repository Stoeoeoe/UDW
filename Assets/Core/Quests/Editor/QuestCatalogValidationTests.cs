using System.Collections.Generic;
using System.Linq;
using Core.Common.Editor;
using Core.Tile.Editor.Vulcanus;
using NUnit.Framework;

namespace Core.Quests.Editor
{
    public sealed class QuestCatalogValidationTests : GameTest
    {
        private static QuestCatalogValidation.KnownContent Known()
        {
            var known = new QuestCatalogValidation.KnownContent();
            known.Characters.Add("base:fabia");
            known.Dialogues.Add("base:fabia_greeting");
            known.Items.Add("base:wine");
            known.TriggersByMap["base:map-1"] = new HashSet<string> { "temple" };
            return known;
        }

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
        public void UnknownReferencesAreReportedWithTheirPlace()
        {
            var quest = Quest("base:nobody", @"
                { id: 'ask', kind: 'talk', character: 'base:fabia', dialogue: 'base:missing_dialogue' },
                { id: 'carry', kind: 'have', item: 'base:amphora', count: 1 },
                { id: 'go', kind: 'reach', map: 'base:map-1', trigger: 'harbour' },
                { id: 'sail', kind: 'reach', map: 'base:island' }");
            Assert.That(QuestCatalogValidation.Problems(quest, Known()).ToArray(), Is.EqualTo(new[]
            {
                "Quest 'base:festival_wine': the giver 'base:nobody' is not a known character.",
                "Quest 'base:festival_wine': objective 'ask' of step 'bring' uses the unknown dialogue 'base:missing_dialogue'.",
                "Quest 'base:festival_wine': objective 'carry' of step 'bring' needs the unknown item 'base:amphora'.",
                "Quest 'base:festival_wine': objective 'go' of step 'bring' uses the unknown trigger 'harbour' on map 'base:map-1'.",
                "Quest 'base:festival_wine': objective 'sail' of step 'bring' goes to the unknown map 'base:island'."
            }));
        }
    }
}
