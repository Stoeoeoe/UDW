using Core.Common.Editor;
using Core.SocialStanding;
using Core.Tile.Editor.Vulcanus;
using NUnit.Framework;

namespace Character.Editor
{
    /// <summary>The character's own dialogue list, which they say when no quest and no routine sets one.</summary>
    public sealed class CharacterDialogueTests : ServiceTest
    {
        private CharacterDefinition Baker(string dialogues) => VulcanusJson.Populate(Game.Asset<CharacterDefinition>(),
            $"{{ id: 'test:baker', name: 'Baker', dialogues: [{dialogues}] }}");

        private string Say(CharacterDefinition character) => character.DialogueFor(Game.Lua.CreateEngine().EvaluateCondition);

        [Test]
        public void TheFirstEntryWhoseConditionHoldsIsWhatTheCharacterSays()
        {
            var baker = Baker(@"
                { dialogue: 'test:hostile', condition: ""SocialStanding.HasLessThan('test:baker', 20)"" },
                { dialogue: 'test:friendly', condition: ""SocialStanding.HasMoreThan('test:baker', 70)"" },
                { dialogue: 'test:plain' }");
            Game.Catalog<CharacterCatalog>(baker);
            var standing = Game.Get<SocialStandingService>();

            Assert.That(Say(baker), Is.EqualTo("test:plain"), "At 50 neither condition holds, so the entry without one applies.");
            standing.Increase("test:baker", 30);
            Assert.That(Say(baker), Is.EqualTo("test:friendly"));
            standing.Decrease("test:baker", 70);
            Assert.That(Say(baker), Is.EqualTo("test:hostile"));
        }

        [Test]
        public void TheSharedEngineFollowsStandingThatSwingsBetweenTheExtremes()
        {
            var baker = Baker(@"
                { dialogue: 'test:wary', condition: ""SocialStanding.HasLessThan('test:baker', 40)"" },
                { dialogue: 'test:friendly', condition: ""SocialStanding.HasMoreThan('test:baker', 59)"" },
                { dialogue: 'test:plain' }");
            Game.Catalog<CharacterCatalog>(baker);
            var standing = Game.Get<SocialStandingService>();
            string Shared() => baker.DialogueFor(Game.Lua.Conditions.EvaluateCondition);

            Assert.That(Shared(), Is.EqualTo("test:plain"));
            standing.Increase("test:baker", 50);
            Assert.That(Shared(), Is.EqualTo("test:friendly"));
            standing.Decrease("test:baker", 100);
            Assert.That(Shared(), Is.EqualTo("test:wary"));
            standing.Increase("test:baker", 100);
            Assert.That(Shared(), Is.EqualTo("test:friendly"));
            standing.Decrease("test:baker", 100);
            Assert.That(Shared(), Is.EqualTo("test:wary"));
        }

        [Test]
        public void OrderDecidesWhenSeveralEntriesHold()
        {
            var baker = Baker("{ dialogue: 'test:first', condition: 'true' }, { dialogue: 'test:second' }");
            Assert.That(Say(baker), Is.EqualTo("test:first"));
        }

        [Test]
        public void WithoutAMatchTheCharacterHasNothingToSay()
        {
            Assert.That(Say(Baker("")), Is.Null, "No list at all.");
            Assert.That(Say(Baker("{ dialogue: 'test:never', condition: 'false' }")), Is.Null, "Nothing holds.");
        }
    }
}
