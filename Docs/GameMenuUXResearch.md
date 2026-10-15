# Game menu UX research

Research date: 10 October 2026. The reference findings below guided the follow-up implementation described at the end of this note.

The player is opening their bag to answer a practical question: "What have I brought, and what do I need next?" Equipment answers "What am I wearing?" The map answers "Where am I going?" Our menu should make these questions easy to answer without presenting every inventory operation at once.

## Actual references

### Stardew Valley: familiar places and direct manipulation

[Inventory screenshot](https://interfaceingame.com/wp-content/uploads/stardew-valley/stardew-valley-inventory-500x281.png) · [Screenshot collection](https://interfaceingame.com/games/stardew-valley/) · [Inventory rules](https://stardewvalleywiki.com/Inventory)

The inspected screenshot shows one compact panel: tabs above, the bag above a character summary, and a tooltip beside the selected item. Tools share the backpack with produce and materials; a bag row provides quick access. Most tools cannot be trashed, and sorting leaves tools alone. Chest interaction instead presents two grids, making the transfer destination visible. The [chest screenshot](https://cdn.alfabetajuega.com/alfabetajuega/2021/01/inventario-stardew-valley.jpg) inspected alongside it is a transfer screen, not the normal bag screen.

**Our takeaway:** preserve familiar item positions, keep useful information near selection, and protect essential tools. Its combined bag/equipment page is a reference, while our agreed separate equipment page remains appropriate. Dragging outside to drop, documented by the wiki, is a behaviour we should avoid copying: an imprecise gesture should not lose an item.

### Animal Crossing: New Horizons: calm presentation and readable state

[Normal pockets screenshot](https://animalcrossingwiki.de/_media/acnh/inventar/inventar_gross.png) · [Inventory reference](https://animalcrossingwiki.de/acnh/inventar) · [Contextual selection screenshot](https://interfaceingame.com/screenshots/animal-crossing-new-horizons-pocket-inventory/)

In the normal screenshot, large icons sit on a light, softly shaped panel. Empty positions are subtle dots. Quantity numbers attach to items. A check identifies the held watering can; stars are visually distinct from that check. Clothing has its own entry. The other inspected screenshot shows a contextual selection state with unavailable items faded and a clear confirmation prompt. These are reference captures, not a claim about every feature of the latest game version.

**Our takeaway:** make the items the visual focus. Selection, being in hand, and belonging to quick access need different signals. Our gold selection border and "In hand" marker are a start, but large equal-weight green buttons still overpower them. A small contextual choice can work; the problem is opening a generic submenu to reach routine actions.

### Rune Factory 3 Special: full menu versus everyday access

[Official web manual](https://manuals.marvelousgames.com/rf3sp/05/index.html)

The manual describes a Camp Menu with Bag & Status, Skills, Party, Friendship Level and Settings. A separate Pocket shortcut accesses frequently used weapons, farm tools and other items; players organise its order through the bag. The field display shows the equipped tool/seeds and water capacity when the waterpot is equipped. This reference was reviewed through its official manual, rather than an inspected Camp Menu screenshot.

**Our takeaway:** the full menu can hold several distinct purposes while everyday farming stays fast. More top-level pages do not imply more buttons inside the bag. Tool state such as remaining water belongs where it helps decide the next action, when that mechanic exists.

## Proposed organisation for our game

Keep one stable frame with persistent tabs and a consistent close control. Each page replaces the content area. A map or character page should feel like turning a page, not opening another window on top of the bag. Keep placeholders useful for development; expose a page to players when it has meaningful content.

| Page | Player's question | Content worth showing |
| --- | --- | --- |
| Bag | What am I carrying? | Item grid, quick access, selected item and its useful action |
| Equipment | What am I wearing? | Character preview, worn slots, compatible replacements |
| World / Map | Where am I going? | Map, current location, known destinations |
| Journal | What was I working on? | Current goals and requests |
| Skills / Relationships | How am I progressing? | Actual unlocked progression and known people |
| Settings | How do I play comfortably? | Controls, sound and display options |

Not all of these need to ship together. The shell supports them without requiring the player to navigate empty destinations.

### Bag layout

Use a generous item grid on the left and a steady detail area on the right at desktop sizes. Keep quick access as a clearly marked portion of the same bag. The detail area shows the item icon, name, a short purpose, relevant state, and one useful primary action. On smaller screens the detail area can sit below the grid; the outer frame remains stable.

- Tool: "Put in hand". When already held, show that state instead of offering the same action again.
- Seeds: "Put in hand", with a concise planting description. Planting happens back in the world.
- Food: "Eat", with the actual stamina benefit beside it.
- Wearable: "Wear", leading to or updating the equipment page without another full-screen layer.
- Material or produce: useful description and quantity; no need to invent a primary action.

Remove the generic **Actions** button. Reordering is direct dragging, with a keyboard/controller equivalent. Stack splitting is a secondary action only for stacks larger than one; a quantity prompt is justified there. Quick access destinations should be visible slots, not a numbered administrative list. Sorting should leave quick access positions alone.

The equipment page should begin with the character and worn items. Selecting a worn slot shows compatible replacements within that page. An all-equipment list before the player has chosen a slot makes them do the matching work themselves.

### Handling important items

Dropping is currently too prominent beside ordinary actions. Move it to a quiet secondary location, and label it as leaving the item on the ground. Keep disposal and world dropping distinct if both ever exist.

Essential farming tools and quest-critical items should not be droppable or disposable. Valuable but replaceable items can have a deliberate confirmation showing the item and quantity. Do not ask for confirmation for every harmless action; routine movement between slots should remain fast. Cancelling a drag or releasing outside the bag should return the stack safely, not drop it into the world.

This requires an explicit essential-item policy in a later implementation pass. A confirmation cannot substitute for deciding which items the game must preserve. Avoid blanket protection for all tools if players can legitimately obtain redundant replacements.

### Visual direction

Keep the warm paper, muted green and gold palette. Give item art more room, soften empty slots, and reduce heavy outlines and repeated large buttons. Reserve the strongest green for the useful action. Use the same typography, spacing and selection language across pages. A framed character portrait can give Equipment personality; a pile of decorative icons or simulated leather textures would add noise before solving the interaction problems.

The intended hierarchy is **items → selection → useful action → secondary operations**. Money can stay quiet in the footer; sell prices become useful in a merchant context. Avoid repeating slot counts, empty equipment labels, control manuals and zero-value fields in the main view.

## Changes and verification in this pass

- The menu frame occupies 86% of viewport width and 88% of height, centred, with scrolling content inside it.
- Managed screens update the player interaction context immediately on opening and closing, independently of their character/clock pause policy. World mode, actionable targets, pointer targeting and tile previews respect that context.
- Preparing a tool action is interrupted when a menu opens; its coroutine is stopped so a deferred release cannot execute it after closing the menu. Interruption also releases the action's own character freeze.
- In Play mode, Bag, Equipment and World had identical measured bounds. Device mouse clicks inspected an item and navigated those pages while preserving item quantities. While open, the context reported blocked world interaction, mode None and no actionable target.

## Applied follow-up

The bag now presents five columns beside a stable item-detail area, with quick access above storage. Narrow layouts stack the detail area underneath and bring it into view when selecting an item. Selection, being in hand, and carried stacks remain separate states.

The generic Actions menu is removed. Put in Hand, Eat and Wear are contextual primary actions; already held items display their state. Stack splitting and dropping use inline prompts in place of the normal detail actions. Quick-access destinations appear as a small grid matching the bag's slot order. Dropping is a quiet secondary action, names the item and quantity, and gives initial focus to Keep in Bag.

Item definitions expose Prevent Dropping. The authored hoe, watering jar and scythe enable it, and the world-item spawning API rejects protected items. This is explicit content policy, rather than blanket protection for every future tool. Equipment starts with worn slots and only shows replacements compatible with the selected slot; returning worn items to the bag is explicit.

The warm palette is retained, with softer empty cells, larger item previews, quieter secondary actions and themed scrollers. The fixed outer footprint and context-based world blocking remain in place. See [inventory authoring](../Assets/UI/InventoryScreen/SETUP_GUIDE.md) for the current behaviour and configuration.
