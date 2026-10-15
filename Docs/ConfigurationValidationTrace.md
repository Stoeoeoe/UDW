# Configuration validation migration

All listed assets use the shared Inspector/edit hook, project-wide command, and
pre-build scan. Common field, nested-entry and reference rules are declared with validation
attributes. Domain and cross-field rules remain in separate stateless validators.
Neither layer repairs values.
The scan includes disabled and unreferenced authored assets. Configuration must
remain unchanged during gameplay; validate programmatic content before exposing it.

| Asset / validator | Configuration rules | Runtime trace and retained checks |
| --- | --- | --- |
| `PlantData` / `PlantDataValidator` | Seasons present (empty allowed); harvest item/ID; inclusive yield bounds; wilt/removal days; ordered, nonnull stages starting at zero; stage presentation; defined method; valid immature regrowth before every harvestable stage. | `PlantData` assumes valid configuration. Harvest method, maturity, crop condition, and inventory availability remain gameplay decisions. |
| `ItemDefinition` / `ItemDefinitionValidator` | Explicit nonblank stable item ID, positive stack size, nonnegative base prices. Zero prices allowed. | `InventoryStorage` trusts authored IDs and loaded save data. Missing required definitions and invalid programming arguments fail clearly; full capacity remains a gameplay rejection. Held-stack changes go through `InventoryInteraction`. IDs are no longer generated silently by `OnValidate`. |
| `ToolData` / `ToolDataValidator` | Common item rules; nonnegative charge/stamina values; finite nonnegative action/cooldown durations; tile-effect configuration and offset array present. | `ToolAction.ComputeAffectedTiles` assumes configured offsets. Missing component tool assignment, target selection, stamina and available charge remain runtime checks. Empty offsets and optional clips/animations remain supported. |
| `SeedItem` / `SeedItemValidator` | Common item rules plus required valid plant reference, including its seed stage representation. | `GetPlaceableRepresentation` directly uses stage zero. Placement eligibility and current tile/season conditions remain gameplay checks. |
| `StaminaConsumableItem` / `StaminaConsumableItemValidator` | Common item rules and restoration of at least one stamina point. | `CanConsume` only checks the character's ability to restore stamina and current stamina. |
| `EquipmentSlotDefinition` / `EquipmentSlotDefinitionValidator` | Stable nonblank slot ID. | Equipment APIs retain supported-slot and item compatibility checks; required references are setup contracts. |
| `WornEquipmentItem` / `WornEquipmentItemValidator` | Common item rules; allowed slot references/IDs; nonnull modifier array; defined attributes and finite modifiers. Negative bonuses and empty arrays allowed. | `Fits` no longer skips malformed configured references. Character modifier APIs keep checks because callers can also supply runtime modifiers. |
| `InventoryConfiguration` / `InventoryConfigurationValidator` | Positive columns, toolbelt and rows; row capacity fits `int`; nonnegative upgrade prices; arrays present; valid and unique configured slots. | `SlotInventory` uses configured dimensions directly; equipment matching no longer skips malformed slots; upgrade no longer rejects configured negative prices. Saved capacity, wallet, current rows, slot bounds and optional absent configuration remain runtime checks. Upgrade order is unrestricted: runtime selects the next larger capacity. |
| `ShopDefinition` / `ShopDefinitionValidator` | Existing offering validation: permanent unique IDs, valid items, defined restock mode, finite chance in [0,1], inclusive nonnegative stock below `int.MaxValue`, finite nonnegative price multipliers. | `Shop.GetPrice` no longer rejects malformed configuration. Computed price overflow remains checked, since valid finite multipliers can still produce an unrepresentable price. Quantity, stock, funds, inventory capacity, availability and transaction boundaries remain checked. |
| `SkillDefinition` / `SkillDefinitionValidator` | Namespaced ID; nonempty/non-null levels including level zero; finite values; valid gameplay tags and attribute bonuses. | `MaxLevel`, `GetLevelDefinition`, `GetValueAtLevel` and `CharacterSkills` no longer fall back for malformed level configuration. Requested levels still clamp. Mod registration validates once, then checks duplicate membership. |
| `BoonDefinition` / `BoonDefinitionValidator` | Valid tags; nonnull bonus entries; defined attributes and finite modifiers. Optional null grant arrays mean no grants. | `CharacterGrant` keeps empty-grant behavior and runtime modifier APIs. Boon's edit hook still resets its cache, then delegates validation to the base hook. |
| `DeityDefinition` / `DeityDefinitionValidator` | Existing nonblank ID policy (legacy IDs allowed); nonnegative decay; nonnull levels; positive thresholds; valid boon references. Empty levels/boons allowed. | `DivineFavourManager` no longer skips missing configured boons. Saved unknown deity IDs, character availability, favour bounds and decay toward neutral remain checked. Mod registration validates once before checking membership. |
| `UISoundProfile` / `UISoundProfileValidator` | Present entries array; nonnull entries; defined unique cues; assigned clips within nonempty lists; finite volume [0,1]; ordered finite pitch [0.01,3]. | `TryGet` assumes valid entries. `UrGUIManager.PlaySound` uses authored volume/pitch directly without sorting/clamping or skipping missing configured clips. Missing profiles/cues, empty clip lists and zero volume remain intentional silence/inheritance. |
| `TypewriterSound` / `TypewriterSoundValidator` | Nonblank actor ID; ordered finite pitch [-3,3]; no missing entries in a nonempty clip list. | The uGUI presenter no longer skips missing configured clips; it retains optional sound lookup, empty-list silence, text bounds and sound-manager availability. Negative pitch is allowed. Actor matching remains case-insensitive. |

Shared `CatalogValidation` delegates configuration to the asset's validator rather
than special-casing plants and skills. Catalog-wide missing/duplicate identities,
enabled membership and spawnable component validation remain catalog concerns.
Dialogue/world catalogs whose edit hooks only rebuild lookup caches are unchanged.
Dynamic terrain/effect calls and third-party assets are outside this migration.

`ConfigurationValidatorTests` covers valid assets, intentional empty configuration,
item subtype dispatch, missing references, invalid arrays/IDs/numbers, grant rules,
mod registration, unchanged invalid values and inherited Inspector feedback.
`PlantConfigurationValidationTests` covers plant ordering/regrowth and project scan,
sub-assets and build rejection. Existing gameplay suites exercise retained checks.


Common checks now live on each definition with `Validation` attributes. Nested
shop offerings, skill/favour levels, attribute bonuses, equipment modifiers, sound
entries and inventory upgrades opt into `Nested`. `RequiredElements` preserves
entry requirements independently of optional collections. `ValidReference` replaces
repeated referenced-asset loops for seeds, offerings, equipment slots and boons.
Plant harvest-item identity uses a focused member attribute rather than
strengthening that contract to full referenced-item validation. `DefinedEnum`
replaces repeated enum checks. Numeric modifier failures identify individual fields.


Plant harvest field relationships use `AtLeast` and `MemberNotEmpty`.
`GrowthStage` opts into nested `SpriteOrPrefab` validation, which owns visual selection
rules. `PlantDataValidator` retains growth-stage ordering and regrowth. The harvest-item contract remains a
focused nonblank ID check, and optional wilted representations remain optional.

Definitions use private serialized fields with attributes and grouped public getters.
Prototype asset keys and editor fixtures follow the explicit field names; no
`FormerlySerializedAs` aliases are retained.


Gameplay consumer audit: seed planting and equipment presentation trust required
references and collection entries. Plant visuals trust validated growth-stage
representations; wilted representations remain optional, but are validated when
supplied. Resolved inventory items trust authored IDs; missing required definitions fail clearly. Other raw IDs still
require a stable ID before being written into inventory state.

Retained guards cover runtime quantities/indices, scene lifecycle boundaries,
optional component/profile assignments, enabled catalog membership and computed
trade-price overflow. Missing required services and unresolved occupied inventory
slots are setup or save-data failures, rather than normal gameplay rejection.
The Vulcanus item importer supports the private backing fields of read-only getters,
including inherited item fields, so authoring still populates the validated data.

The full validated-asset scan also gates entry into Play Mode, including assets
outside catalogs. Build validation uses the same scan; gameplay does not rescan.
