using System.Linq;
using Core.Quests;
using NUnit.Framework;
using Sirenix.OdinInspector;
using Sirenix.OdinInspector.Editor;

namespace Core.Common.Editor
{
    public sealed class ImportedDataAttributeProcessorTests : GameTest
    {
        [Test]
        public void ImportedDefinitionsAreReadOnlyInTheInspector()
        {
            using var tree = PropertyTree.Create(Game.Asset<QuestDefinition>());
            var shown = tree.RootProperty.Children.Select(child => child).ToList();

            Assert.That(shown.Select(child => child.NiceName), Does.Contain("Id").And.Contain("Steps"));
            Assert.That(shown.Where(child => child.GetAttribute<ReadOnlyAttribute>() == null).Select(child => child.NiceName), Is.Empty);
        }
    }
}
