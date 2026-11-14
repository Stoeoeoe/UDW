using System.Collections.Generic;
using System.Linq;
using Core.Common.Editor;
using NUnit.Framework;

namespace Core.Quests.Editor
{
    public sealed class QuestCatalogValidationTests : GameTest
    {
        private static string Text(string name) => $"Text for {name}";

        private static QuestCatalogValidation.KnownContent Known()
        {
            var known = new QuestCatalogValidation.KnownContent();
            known.Characters.Add("base:fabia");
            known.Dialogues.Add("base:fabia_greeting");
            known.Items.Add("base:wine");
            known.TriggersByMap["base:map-1"] = new HashSet<string> { "temple" };
            return known;
        }

        private QuestDefinition Quest(string giver, params QuestObjective[] objectives)
        {
            var quest = Game.Asset<QuestDefinition>();
            quest.Configure("base:festival_wine", Text("title"), Text("description"), giver,
                new[] { new QuestStep("bring", Text("bring"), objectives) });
            return quest;
        }

        [Test]
        public void KnownReferencesPass()
        {
            var quest = Quest("base:fabia",
                QuestObjective.Talk("ask", Text("ask"), "base:fabia", "base:fabia_greeting"),
                QuestObjective.Deliver("give", Text("give"), "base:fabia", "base:wine", 2),
                QuestObjective.Reach("go", Text("go"), "base:map-1", "temple"));
            Assert.That(QuestCatalogValidation.Problems(quest, Known()), Is.Empty);
        }

        [Test]
        public void UnknownReferencesAreReportedWithTheirPlace()
        {
            var quest = Quest("base:nobody",
                QuestObjective.Talk("ask", Text("ask"), "base:fabia", "base:missing_dialogue"),
                QuestObjective.Have("carry", Text("carry"), "base:amphora", 1),
                QuestObjective.Reach("go", Text("go"), "base:map-1", "harbour"),
                QuestObjective.Reach("sail", Text("sail"), "base:island"));
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
