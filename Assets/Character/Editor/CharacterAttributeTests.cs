using Character;
using NUnit.Framework;

namespace Character.Editor
{
    public sealed class CharacterAttributeTests
    {
        [Test]
        public void FlatAndPercentModifiersCombineAndCanBeReplaced()
        {
            var attribute = new CharacterAttribute(4f);

            attribute.SetModifier("boon:mercury", flat: 1f, percent: 0.1f);
            Assert.That(attribute.Value, Is.EqualTo(5.5f).Within(0.0001f));

            attribute.SetModifier("boon:mercury", percent: 0.25f);
            Assert.That(attribute.Value, Is.EqualTo(5f).Within(0.0001f));

            attribute.SetModifier("equipment:sandals", flat: 2f);
            Assert.That(attribute.Value, Is.EqualTo(7.5f).Within(0.0001f));

            Assert.That(attribute.RemoveModifier("boon:mercury"), Is.True);
            Assert.That(attribute.Value, Is.EqualTo(6f).Within(0.0001f));
            Assert.That(attribute.RemoveModifier("boon:mercury"), Is.False);
        }

        [Test]
        public void NegativeModifiersCannotMakeAnAttributeNegative()
        {
            var attribute = new CharacterAttribute(10f);
            attribute.SetModifier("penalty", flat: -20f);

            Assert.That(attribute.Value, Is.Zero);
        }
    }
}
