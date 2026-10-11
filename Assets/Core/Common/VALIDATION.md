# ScriptableObject configuration validation

Use `ValidatedScriptableObject<TValidator>` for assets whose configuration must be
checked at authoring and build boundaries. The validator derives from
`ScriptableObjectValidator<TAsset>` and implements `CollectConfigurationErrors`.
Validators must be stateless: each generic asset base shares one validator instance.

```csharp
public sealed class ExampleDefinition : ValidatedScriptableObject<ExampleValidator>
{
    [field: SerializeField, Validation.Id("Assign a permanent ID.")]
    public string Id { get; private set; }

    [field: SerializeField, Validation.Min(1)]
    public int Quantity { get; private set; } = 1;
}

public sealed class ExampleValidator : ScriptableObjectValidator<ExampleDefinition>
{
    protected override void CollectConfigurationErrors(
        ExampleDefinition asset, List<ConfigurationError> errors)
    {
        // Add domain rules with Report(errors, asset, setting, message).
    }
}
```

Call `ValidateConfiguration()` to collect all errors independently of Unity callbacks,
or use the validator's `Validate` method directly. Annotated members are checked before
custom rules. `RequireValidConfiguration()` throws if errors exist; use this boundary
check before exposing programmatically created configuration to gameplay.

Rules only inspect configuration. They must not repair values, consult scene state,
or decide whether a gameplay action is currently available. Subclasses can override
`ConfigurationValidator` to select a specialized validator while retaining their
asset inheritance. Inherited attributes run automatically; do not validate the base
asset again inside the specialized validator.

## Editor integration

- The shared Inspector displays errors and provides a **Validate** button, including
  multi-selection. The button logs errors or a success message for each asset.
- `OnValidate` logs errors with their asset context and no call-site stack trace.
- **Tools > Validation > Validate ScriptableObject Configuration** scans validated
  assets under `Assets`, including unreferenced assets and sub-assets.
- A pre-build callback runs the same scan and rejects builds with all errors and paths.

Errors contain the owning asset, setting path, and actionable message. Automatic
property backing fields use the readable property name in error paths.

## Attribute rules

Only annotated instance fields and readable properties are inspected. Private
inherited fields are included; overridden properties inherit their rules. Getters
must be side-effect-free. Reflection metadata is cached, while values and errors
are read afresh on every validation.

Put Inspector and validation attributes on an auto-property's generated field using
`[field: ...]`, as shown above. Explicit serialized fields remain useful for collections
exposed through read-only views. Every rule accepts an optional custom message as its
final constructor argument or named `Message` property. Messages do not interpolate
expressions; omitted messages use defaults.

- `Required`: nonnull values, including missing/destroyed Unity objects.
- `NotEmpty`: nonblank strings or nonempty `ICollection` values. Does not check entries.
- `Id`: nonblank stable IDs; does not enforce namespacing or uniqueness.
- `NamespacedId`: namespace:name policy, optionally with `Lowercase = true`. Separate
  from the existing ID editor drawer; catalogs still own uniqueness.
- `Min` and `Range`: numeric bounds; ranges are inclusive. Bounds must be finite and
  ordered. Add `Finite` when infinity must also be rejected by a minimum-only rule.
- `Finite`: excludes NaN and infinity.
- `DefinedEnum`: exactly one defined enum constant; arbitrary flag combinations fail.
- `RequiredElements`: rejects null/missing collection entries. Null and empty collections
  are allowed; add `Required` or `NotEmpty` to constrain the collection itself.

Numeric rules support built-in numeric types and compare as doubles. Use custom rules
for exact comparisons of large integers or decimals. Unsupported types produce errors.
Attribute-only assets still implement an empty custom validator hook.

## Nested configuration and references

`Nested` opts into validation of plain configuration objects or collection entries,
including structs. Null values are skipped; combine with presence rules as needed.
`ValidReference` requires validated asset references and runs their full validation.
On collections it checks each reference; collection presence is a separate rule.

```csharp
[SerializeField, Validation.NotEmpty, Validation.RequiredElements, Validation.Nested]
private EntryConfiguration[] entries;

[field: SerializeField, Validation.ValidReference]
public ExampleDefinition RelatedDefinition { get; private set; }
```

Traversal never follows unannotated members, scene objects, or asset references
implicitly. Referenced errors retain the owning asset and full indexed/member path.
Shared references are checked independently for each owning path; cycles produce
errors rather than indefinite recursion.

Plain configuration can implement `INestedConfigurationValidator` for involved rules.
Its callback receives a setting suffix and message. An empty suffix reports on the
nested object's owning path; nonempty suffixes extend that path.

## Member relationships and sequences

- `AtLeast(nameof(otherMember))`: compares a numeric value with a sibling field or
  property, including private inherited members.
- `MemberNotEmpty(nameof(ExampleDefinition.Id))`: checks only the named string or
  collection member of a reference. Add `Required` for reference presence. Errors
  stay on the reference field; the complete referenced asset is not validated.
- `Increasing(nameof(EntryConfiguration.Day), First = 0)`: checks finite numeric values
  in strictly increasing collection order. `First` optionally requires an exact value
  at index zero. Null collections/entries are skipped; presence rules remain separate.

These rules support custom messages. Only explicitly named getters are invoked;
missing members, unreadable properties, and incompatible value types produce errors.
Keep domain relationships in explicit validators when that makes them easier to read.
