# Foraging

## Pickup prefabs and item data

`Assets/Core/Items/ForagePickup.prefab` owns the shared trigger, ground blocker,
Y sorting, visual child, animation and lift/fade settings. It is a base template,
not a spawnable item. Runtime code relies on its authored structure.

Create a variant under `Assets/Content/Spawnables`, assign its permanent spawn ID,
`ForageableItem`, quantity and visual sprite. The fig and raven-flower variants
provide examples. Change common presentation on the base prefab so variants inherit
it; override individual settings only when needed.

The item definition supplies inventory identity, optional pickup sound override
and positive **Ground Lifetime Days**. Spawn through
`spawner.Spawn(pickupPrefab, worldPosition)` through an injected `WorldObjectSpawner`, or place the
registered prefab ID (for example `base:forage-fig`) in Vulcanus with a stable
instance ID. The existing importer and spawner handle persistence and activation.

Players must face the pickup, be in range, and have room for the entire stack.
Pickup plays the animation, item/default sound, and lift/fade before granting
items and permanently removing the spawn. Interruption or lost inventory space
restores it without granting items. Authoring validation checks item data,
weighted lists and animation data before play/build. Runtime pickup code does not
revalidate prefab structure, manager readiness or the bind-before-enable contract.

## Daily spots and expiration

Place `base:foraging-spot` as a persistent Vulcanus entity with a stable instance
ID. It is an invisible marker with no gameplay collider. Assign registered
`ForagePickup` prefabs and relative weights in **Forage**, then set **Daily Spawn Chance**.
The list must be nonempty with valid entries and a positive total weight;
zero-weight entries never roll.

An empty spot rolls on first entry and once per game day. Collection does not
allow another roll that day. Uncollected forage stays until expiration; expiration
is processed before the day's roll, allowing a replacement. Revisits catch up only
the current day, and saves preserve the result.

Pickup state saves its expiration alongside spawn placement. The registered prefab
supplies its item and quantity when restored.
**Ground Lifetime Days** starts at creation and does not reset on load or revisit.
An item created on day 5 with a lifetime of 3 expires at the start of day 8.
Collected inventory items do not expire. Authored pickups retain saved removal
markers when collected or expired; generated pickups lose their spawn records.
