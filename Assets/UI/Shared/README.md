# Managed UI screens

## Tabbed game menu

`GameMenuShell.uxml` / `.uss` provide the shared frame, heading, close control, scrollable tab strip and page area. `TabbedMenuShell` owns navigation and presentation without knowing about inventory, equipment or world state. The current menu host composes this shell with `BagPage.uxml` and `EquipmentPage.uxml`; it registers with the existing UI manager as one modal, so changing tabs does not release pause or let world input through.

The host's **Menu Pages** list defines additional tabs by stable ID, display title, optional UXML layout and placeholder text. Defaults are World, Journal, Skills, Relationships and Settings placeholders. Replace a placeholder by assigning its layout; reorder, remove or add entries in that list. No shell code change is required. `bag` and `equipment` are reserved by the built-in page registrations. Page IDs must be unique.

For pages with behaviour, subscribe to the host's `MenuBound` event and register the page on each new UI tree: `shell.RegisterPage(id, title, content, canLeave, shown, hidden)`. Supply a fresh content element each time. `canLeave` can keep a page open until its interaction is resolved. `shown`/`hidden` own page-specific subscriptions or refresh work. The public `Menu.SelectPage(id)` opens a registered tab. The shell can also be composed by another `ManagedUIScreen` host using the same layout and callbacks; it does not depend on the inventory presenter.

Tab and pointer input use the common UI input setup. Left/right arrows on the tab strip switch pages, wrapping at the ends; Tab reaches the active page's controls. The tab strip and content can scroll independently as menus grow. Replacing the document tree rebuilds registrations and restores the active page when it still exists. Opening the current game menu starts on Bag. Closing/Escape, pause and sounds remain the host's managed-screen policy.

`UrGUIManager` owns screen visibility, pause requests and shared UI audio. UI Toolkit screens derive from `ManagedUIScreen`, bind their root with `RebindRoot`,
and call `OpenScreen` / `CloseScreen` without supplying a root. On document rebuild,
explicitly rebind the replacement root; an open screen retains its pause request,
modal position and input-map selection. Canvas presenters use the show/hide callback
overload. `OnScreenClosed` runs once for an actual close, never for a repeated close
or an unopened screen. Remembered focus is restored only while it still belongs to
the bound root and can receive focus. `PauseWhileOpen` selects character controls, the game calendar, both, or neither. An individual open can override that selection. Overlapping screens retain their own pause requests until closed; UI animation and audio continue running.
The manager tracks the current player through `MainCharacterChangedEvent` and closes
all managed screens when that character enters `ConditionState.Dead`. Character
replacement and manager disable detach the old condition subscription. NPC deaths
do not close player menus. This does not implement death or pass-out gameplay.

Every managed screen blocks world interaction through `PlayerInteractionContextSnapshot.WorldInteractionBlocked`, even when its pause policy is None. The manager refreshes the context immediately when visibility changes; action mode, actionable targets, pointer targeting and tile previews respect `CanInteractWithWorld`. Opening a menu cancels a preparing primary action and stops its coroutine, rather than deferring the release until closing. Already executing actions can finish.

The shared frame is centred at 86% of the viewport width and 88% of its height. Page content scrolls inside that rectangle, so changing tabs or selecting an item does not resize the menu.

## Input ownership

`InputManager` uses the action asset owned by SystemRoot's `PlayerInput`; gameplay
and its linked `InputSystemUIInputModule` share that instance. It enables maps
explicitly instead of creating a second generated action instance.

`Global` contains OpenInventory and Pause, available during gameplay and menus.
`UI` supplies standard navigation/pointer actions for the HUD and open screens.
With no modal, `PlayerControls` is enabled. Each `ManagedUIScreen` selects an
**Input Action Map**, defaulting to UI. The top modal selects that map; closing it
restores the underlying modal's map, or PlayerControls when the stack is empty.
Custom screen maps add screen-specific actions alongside standard UI navigation;
they must exist in the same asset and cannot select PlayerControls or Global.

Map selection is independent of pause policy. Lower UI Toolkit roots are disabled
and release focus; returning to them restores their previous focused element.
Canvas screens apply the same ownership through their CanvasGroup. Rebinding an
open document does not change its stack priority. Location input disabling gates
all maps, and re-enabling honors the current modal selection.

## Sound authoring

The SystemRoot prefab references `DefaultUISounds.asset`. Edit that profile to change shared Click, Open, Close and Denied cues. Each entry contains clip variants, mixer group, volume and pitch range; playback uses the existing sound manager. All audio references are serialized in the profile.

Create additional profiles with **Create > Game > UI > Sound Profile** and assign a screen's **Sound Overrides**. Missing entries inherit the shared profile. An entry with no clips or zero volume explicitly silences its cue. Use one entry per cue. Leaving the manager's profile unset silences cues without an override.

Open and Close cues play centrally once per visibility transition. Disabling screens, leaving a location and manager teardown close silently. Reopening to bind a replacement UI tree does not replay Open.

Screen action handlers call `PlayUISound(UISoundCue.Click)` or `PlayUISound(UISoundCue.Denied)` after accepting an action or receiving its outcome. Inventory actions, dialogue advance/choices and shop trades use this API. Successful shop trades play Click; rejected trades play Denied. Gameplay transaction code does not play UI sounds. New screen controls can use the same API; avoid adding a second audio callback to controls that already invoke it.
