using System;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Common.Editor
{
    [Category("ConfigurationValidation")]
    public sealed class ValidationAttributeTests
    {
        private readonly List<Object> _objects = new();

        private T Create<T>() where T : ScriptableObject
        {
            var asset = ScriptableObject.CreateInstance<T>();
            _objects.Add(asset);
            return asset;
        }

        [TearDown]
        public void Cleanup()
        {
            foreach (var instance in _objects) if (instance) Object.DestroyImmediate(instance);
            _objects.Clear();
        }

        [Test]
        public void InheritedPrivateFieldsAndExplicitPropertiesCombineWithCustomRules()
        {
            var asset = Create<AttributeTestAsset>();
            asset.Reference = asset;
            asset.Code = " ";
            asset.Quantity = 0;
            asset.CheckCustomRule = true;
            var errors = asset.ValidateConfiguration();
            Assert.That(errors.Select(error => error.Setting), Is.EquivalentTo(new[] { "Code", "Quantity", "custom" }));
            Assert.That(errors.Single(error => error.Setting == "Code").Message, Is.EqualTo("Choose an ID."));
            Assert.That(errors.Single(error => error.Setting == "Quantity").Message, Is.EqualTo("Choose a quantity."));
            Assert.That(asset.Code, Is.EqualTo(" "));
            Assert.That(asset.Quantity, Is.Zero);
        }

        [Test]
        public void MetadataCacheDoesNotCacheValuesOrErrorsAndDirectValidatorUsesAttributes()
        {
            var asset = Create<AttributeTestAsset>();
            asset.Reference = asset;
            Assert.That(new AttributeTestValidator().Validate(asset), Is.Empty);
            asset.Text = "\t";
            asset.Entries.Clear();
            var errors = new AttributeTestValidator().Validate(asset);
            Assert.That(errors.Select(error => error.Setting), Is.EquivalentTo(new[] { "Text", "Entries" }));
            asset.Text = "restored";
            asset.Entries.Add(null); // Nonempty does not imply nonnull entries.
            Assert.That(asset.ValidateConfiguration(), Is.Empty);
        }

        [Test]
        public void RequiredRecognizesDestroyedUnityObjects()
        {
            var asset = Create<AttributeTestAsset>();
            var reference = Create<AttributeTestAsset>();
            asset.Reference = reference;
            Object.DestroyImmediate(reference);
            Assert.That(asset.ValidateConfiguration().Single().Setting, Is.EqualTo("Reference"));
        }

        [TestCase(double.NaN)]
        [TestCase(double.PositiveInfinity)]
        [TestCase(double.NegativeInfinity)]
        public void NumericRulesRejectNonfiniteValues(double value)
        {
            var asset = Create<AttributeTestAsset>();
            asset.Reference = asset;
            asset.Number = value;
            Assert.That(asset.ValidateConfiguration().Count(error => error.Setting == "Number"), Is.EqualTo(2));
        }

        [Test]
        public void RangeIsInclusiveAndNamespacedIdUsesExplicitPolicy()
        {
            var asset = Create<AttributeTestAsset>();
            asset.Reference = asset;
            foreach (var boundary in new[] { 0d, 10d })
            {
                asset.Number = boundary;
                Assert.That(asset.ValidateConfiguration(), Is.Empty);
            }
            asset.Number = 11;
            asset.NamespacedCode = "Base:Thing";
            Assert.That(asset.ValidateConfiguration().Select(error => error.Setting),
                Is.EquivalentTo(new[] { "Number", "NamespacedCode" }));
        }

        [Test]
        public void OverriddenPropertiesInheritRulesWithoutDuplicateReports()
        {
            var asset = Create<AttributeTestAsset>();
            asset.Reference = asset;
            asset.Quantity = -1;
            Assert.That(asset.ValidateConfiguration().Single().Setting, Is.EqualTo("Quantity"));
        }

        [Test]
        public void InheritedRulesAreReportedOnceAlongsideCustomErrors()
        {
            var asset = Create<AttributeTestAsset>();
            asset.Reference = asset;
            asset.Code = " ";
            asset.Quantity = 0;
            asset.CheckCustomRule = true;
            var errors = asset.ValidateConfiguration();
            Assert.That(errors.Count(error => error.Setting == "Code"), Is.EqualTo(1));
            Assert.That(errors.Count(error => error.Setting == "Quantity"), Is.EqualTo(1));
            Assert.That(errors.Count(error => error.Setting == "custom"), Is.EqualTo(1));
        }

        [Test]
        public void UnsupportedAttributeTypesReportAnErrorInsteadOfPassingSilently()
        {
            var asset = Create<MisconfiguredAttributeAsset>();
            var error = asset.ValidateConfiguration().Single();
            Assert.That(error.Setting, Is.EqualTo("Number"));
            Assert.That(error.Message, Does.Contain("NotEmpty requires"));
        }

        [Test]
        public void NestedObjectsStructsAndMissingEntriesReportFullPathsAndCustomMessages()
        {
            var asset = Create<TraversalTestAsset>();
            asset.Nodes = new List<TraversalTestNode> { null, new() { Count = 0 } };
            asset.Values = new[] { new TraversalTestValue { Number = float.NaN } };
            var errors = asset.ValidateConfiguration();
            Assert.That(errors.Select(error => error.Setting),
                Is.EquivalentTo(new[] { "Nodes[0]", "Nodes[1].Count", "Values[0].Number" }));
            Assert.That(errors.Single(error => error.Setting == "Nodes[0]").Message, Is.EqualTo("Assign a node."));
            Assert.That(errors.All(error => error.Asset == asset), Is.True);
            asset.Nodes[1].Count = 1;
            Assert.That(asset.ValidateConfiguration().Any(error => error.Setting == "Nodes[1].Count"), Is.False);
        }

        [Test]
        public void ReferenceValidationRetainsOwnerAndReferencedFieldAndRequiresEntries()
        {
            var asset = Create<TraversalTestAsset>();
            var item = Create<AttributeTestAsset>();
            item.Reference = item;
            item.Code = " ";
            asset.References = new ValidatedScriptableObject[] { item, null };
            var errors = asset.ValidateConfiguration();
            Assert.That(errors.Any(error => error.Setting == "References[0].Code" && error.Asset == asset), Is.True);
            Assert.That(errors.Count(error => error.Setting == "References[1]"), Is.EqualTo(1));
            asset.References = null; // Entry validation does not require the optional collection.
            Assert.That(asset.ValidateConfiguration(), Is.Empty);
        }

        [Test]
        public void NestedAndAssetReferenceCyclesAreReportedAndTraversalIsCleanedUp()
        {
            var asset = Create<TraversalTestAsset>();
            var node = new TraversalTestNode();
            node.Child = node;
            asset.Nodes.Add(node);
            asset.References = new ValidatedScriptableObject[] { asset };
            var errors = asset.ValidateConfiguration();
            Assert.That(errors.Any(error => error.Setting == "Nodes[0].Child" && error.Message.Contains("cycle")), Is.True);
            Assert.That(errors.Any(error => error.Setting == "References[0].configuration" && error.Message.Contains("cycle")), Is.True);
            node.Child = null;
            asset.References = Array.Empty<ValidatedScriptableObject>();
            Assert.That(asset.ValidateConfiguration(), Is.Empty);
        }

        [Test]
        public void ComparisonReadsCurrentSiblingValuesAndUsesCustomMessages()
        {
            var asset = Create<TraversalTestAsset>();
            asset.Minimum = 5;
            asset.Maximum = 4;
            var error = asset.ValidateConfiguration().Single();
            Assert.That(error.Setting, Is.EqualTo("Maximum"));
            Assert.That(error.Message, Is.EqualTo("Maximum too small."));
            asset.Maximum = 5;
            Assert.That(asset.ValidateConfiguration(), Is.Empty);
            asset.Minimum = 6;
            Assert.That(asset.ValidateConfiguration().Single().Setting, Is.EqualTo("Maximum"));
        }

        [TestCase(0, 2, 5, null)]
        [TestCase(1, 2, 5, "Sequence[0].Day")]
        [TestCase(0, 0, 5, "Sequence[1].Day")]
        [TestCase(0, 3, 2, "Sequence[2].Day")]
        public void SequenceChecksFirstValueAndStrictOrdering(int first, int second, int third, string expected)
        {
            var asset = Create<TraversalTestAsset>();
            asset.Sequence = new[] { new SequenceTestNode { Day = first }, new SequenceTestNode { Day = second }, new SequenceTestNode { Day = third } };
            var errors = asset.ValidateConfiguration();
            if (expected == null) Assert.That(errors, Is.Empty);
            else Assert.That(errors.Single().Setting, Is.EqualTo(expected));
            Assert.That(asset.Sequence[1].Day, Is.EqualTo(second));
        }

        [Test]
        public void SequenceSkipsMissingEntriesWhileRequiredElementsReportsThem()
        {
            var asset = Create<TraversalTestAsset>();
            asset.Sequence = new[] { new SequenceTestNode(), null, new SequenceTestNode { Day = 2 } };
            Assert.That(asset.ValidateConfiguration().Single().Setting, Is.EqualTo("Sequence[1]"));
            asset.Sequence = null;
            Assert.That(asset.ValidateConfiguration(), Is.Empty);
        }

        [Test]
        public void FocusedMemberRuleChecksOnlyTheNamedMemberAndReportsOnTheReference()
        {
            var asset = Create<TraversalTestAsset>();
            var reference = Create<AttributeTestAsset>();
            reference.Code = " ";
            asset.Identity = reference;
            Assert.That(asset.ValidateConfiguration().Single().Setting, Is.EqualTo("Identity"));
            reference.Code = "test:asset";
            // Other required configuration is intentionally absent.
            Assert.That(reference.ValidateConfiguration(), Is.Not.Empty);
            Assert.That(asset.ValidateConfiguration(), Is.Empty);
        }

        [Test]
        public void NestedCustomRulesReportOnTheOwningPathAndReadCurrentValues()
        {
            var asset = Create<TraversalTestAsset>();
            asset.CustomConfiguration = new NestedTestConfiguration { IsValid = true };
            Assert.That(asset.ValidateConfiguration(), Is.Empty);
            asset.CustomConfiguration.IsValid = false;
            var error = asset.ValidateConfiguration().Single();
            Assert.That(error.Setting, Is.EqualTo("CustomConfiguration"));
            Assert.That(error.Asset, Is.SameAs(asset));
            Assert.That(error.Message, Is.EqualTo("Custom configuration is invalid."));
        }
    }

    public abstract class AttributeTestBase : ValidatedScriptableObject<AttributeTestValidator>
    {
        [field: SerializeField, Validation.Id("Choose an ID.")]
        public string Code { get; set; } = "test:asset";

        [Validation.Min(1, Message = "Choose a quantity.")]
        public virtual int Quantity { get; set; } = 1;
    }

    public sealed class AttributeTestAsset : AttributeTestBase
    {
        public override int Quantity { get; set; } = 1;
        [Validation.Required] public Object Reference;
        [Validation.NotEmpty] public string Text = "valid";
        [Validation.NotEmpty] public List<string> Entries = new() { "entry" };
        [field: SerializeField, Validation.Finite, Validation.Range(0, 10)]
        public double Number { get; set; } = 1;
        [Validation.NamespacedId(Lowercase = true)] public string NamespacedCode = "test:asset";
        public bool CheckCustomRule;
        public string UnannotatedGetter => throw new InvalidOperationException("Must not be inspected.");
    }

    public sealed class AttributeTestValidator : ScriptableObjectValidator<AttributeTestBase>
    {
        protected override void CollectConfigurationErrors(AttributeTestBase asset, List<ConfigurationError> errors)
        {
            if (asset is AttributeTestAsset { CheckCustomRule: true }) Report(errors, asset, "custom", "Custom rule failed.");
        }
    }

    public sealed class MisconfiguredAttributeAsset : ValidatedScriptableObject<MisconfiguredAttributeValidator>
    {
        [Validation.NotEmpty] public int Number;
    }

    public sealed class MisconfiguredAttributeValidator : ScriptableObjectValidator<MisconfiguredAttributeAsset>
    {
        protected override void CollectConfigurationErrors(MisconfiguredAttributeAsset asset, List<ConfigurationError> errors) { }
    }

    public sealed class TraversalTestAsset : ValidatedScriptableObject<TraversalTestValidator>
    {
        [Validation.RequiredElements("Assign a node."), Validation.Nested]
        public List<TraversalTestNode> Nodes = new();
        [Validation.Nested] public TraversalTestValue[] Values = Array.Empty<TraversalTestValue>();
        [Validation.ValidReference] public ValidatedScriptableObject[] References = Array.Empty<ValidatedScriptableObject>();
        public int Minimum = 1;
        [Validation.AtLeast(nameof(Minimum), "Maximum too small.")] public int Maximum = 1;
        [Validation.RequiredElements, Validation.Increasing(nameof(SequenceTestNode.Day), First = 0)]
        public SequenceTestNode[] Sequence;
        [Validation.MemberNotEmpty(nameof(AttributeTestBase.Code))] public AttributeTestAsset Identity;
        [Validation.Nested] public NestedTestConfiguration CustomConfiguration;
    }

    [Serializable]
    public sealed class NestedTestConfiguration : INestedConfigurationValidator
    {
        public bool IsValid;

        public void CollectConfigurationErrors(Action<string, string> report)
        {
            if (!IsValid) report("", "Custom configuration is invalid.");
        }
    }

    [Serializable]
    public sealed class SequenceTestNode
    {
        public int Day;
    }

    [Serializable]
    public sealed class TraversalTestNode
    {
        [Validation.Min(1)] public int Count = 1;
        [NonSerialized, Validation.Nested] public TraversalTestNode Child;
    }

    [Serializable]
    public struct TraversalTestValue
    {
        [Validation.Finite] public float Number;
    }

    public sealed class TraversalTestValidator : ScriptableObjectValidator<TraversalTestAsset>
    {
        protected override void CollectConfigurationErrors(TraversalTestAsset asset, List<ConfigurationError> errors) { }
    }
}
