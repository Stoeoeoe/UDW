using Core.Common.Editor;
using NUnit.Framework;

namespace Character.Editor
{
    public sealed class CharacterWalkSpeedTests : GameTest
    {
        [Test]
        public void CharactersWalkAtTheSpeedTheirDefinitionAuthors()
        {
            var definition = UnityEditor.AssetDatabase.LoadAssetAtPath<UnityEngine.GameObject>("Assets/Character/Player/TestCharacter.prefab")
                .GetComponent<GameCharacter>().Definition;
            var authored = definition.WalkSpeed;
            Reflect.Set(definition, "WalkSpeed", 2.5f);
            try
            {
                var character = Game.CreateCharacter();
                Assert.That(character.Attributes.WalkSpeed, Is.EqualTo(2.5f), "The prefab's own walk speed is replaced by the definition's.");
            }
            finally { Reflect.Set(definition, "WalkSpeed", authored); }
        }
    }
}
