using System;
using NUnit.Framework;

namespace Core.Catalogs.Editor
{
    public sealed class IdIndexTests
    {
        [Test]
        public void FirstWinsPreservesSpecializedComparisonAndSkipsMissingIds()
        {
            var index = IdIndex.FirstWins(new[] { null, "", " ", "Mars", "mars" }, id => id,
                StringComparer.OrdinalIgnoreCase);
            Assert.That(index.Count, Is.EqualTo(1));
            Assert.That(index["MARS"], Is.EqualTo("Mars"));
        }

        [Test]
        public void ComparisonIsChosenByTheConsumer()
        {
            var index = IdIndex.FirstWins(new[] { "Mars", "mars" }, id => id, StringComparer.Ordinal);
            Assert.That(index.Count, Is.EqualTo(2));
        }

        [Test]
        public void MissingCollectionProducesAnEmptyIndex()
        {
            Assert.That(IdIndex.FirstWins<string>(null, id => id, StringComparer.Ordinal), Is.Empty);
        }
    }
}
