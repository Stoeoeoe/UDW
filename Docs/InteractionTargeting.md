# Interaction targeting

The player uses one interactable at a time: the **target**. Only interactables that need a
button press, are ready (`CanInteract`) and are **in reach** can be targeted. Walk-in
interactables, such as portals, still trigger on contact and are never targeted.

**Reach:** a tile of the interactable's footprint is the player's tile or one of the eight
around it (the 3×3). The footprint is the set of tiles under the target object's enabled
solid (non-trigger) colliders. Without any, it is the interaction collider.

**Picking:** the input device picks the target (`InputManager.UsesPointer`):

- **Keyboard and mouse:** the interactable under the pointer. The pointer must be over a
  visible pixel of one of the target object's sprites. Where several overlap, the one lowest
  on screen wins. Nothing is used when nothing is hovered, even if something is in front of
  the player.
- **Gamepad:** the interactable closest to the facing direction (at most 90° away), then
  the nearest. The direction is measured to the closest point of its footprint.

`InteractionSensor` makes both picks from the interaction colliders on the Interactable layer
within two units of the player's ground anchor (a `Physics2D.OverlapCircle`).
`PlayerInteractionContextSnapshot.ActionableInteractable` is the result.

## Buttons

- **Interact** (right click, E, Space; gamepad South) uses the target: talk, open, pick, sit.
  Without a target it does nothing. It reacts to the press only, never to the release.
- **Action** (left click, Q; gamepad West) uses the held tool or seed. While something is
  targeted it does nothing, so a tool never hits or reaches past what the player aims at.
  With the mouse that means hovering a target; on gamepad, a target in front.

`CharacterPerformPrimaryActionAbility` picks the button; the mode resolver still picks the
action. Leaving a seat accepts either button.

## Prompt

`InteractionPromptPresenter` (on SystemRoot, with the HUD) shows the Interact button and
the target's verb above the target's art, e.g. `[E] Open`. The glyphs follow the device in
use: the keyboard-and-mouse list, or the Xbox, PlayStation (DualShock/DualSense) or Switch
gamepad glyph. They come from the CC0 `gdb` button sheets in `Assets/UI/Prompts/Glyphs`;
assign other sprites in the presenter's lists.

Each interactable kind names its verb by overriding `AbstractInteractable.Verb` (default
"Use"). An `InteractionVerb` has a stable message key, `interaction.verb.<name>`, and its
English text; translation is tracked in STO-110.

## Authoring

Set **Target** on every interactable that has art of its own. It is the object holding the
interactable's sprites and solid colliders, usually the prefab root. For a character it is
the character root, even when the interactable sits on a child with a larger talk trigger.
Leave it empty for things without their own art, such as doors and map triggers: the
interaction collider is then used for both hovering and reach.

Select an interactable to see its gizmo. Cyan shows what the pointer hovers (sprite bounds,
or the interaction collider) and yellow shows the footprint.

Target art must be readable (**Read/Write**), use the **Full Rect** sprite mesh type and the
default lit sprite material; button-press interactables must be on the **Interactable** layer.
`InteractableConfigurationValidation` checks this for prefabs, plant data and the open scenes
when you enter Play Mode (and stops it, listing every problem), and for builds; a test runs it
over the authored prefabs and plants. Crops set their target in code
(`PlantHarvestInteractable.Bind`), because their art is created at runtime.

## Highlight

`InteractionHighlighter` (on SystemRoot) draws the target's sprites with its highlight
material while it is the target, then gives each sprite its own material back. It uses
`InteractionSoftOutline.mat`: URP's default lit sprite shader plus a pixel outline around the
art, two rings that fade out like a glow (warm yellow at 50%, then 20%), both ignoring scene
lighting. `InteractionOutline.mat` uses the same shader with a solid yellow ring and a 50%
black ring outside it; assign it to the highlighter on SystemRoot to switch back. The shader grows each sprite's quad by two art pixels, so art
that touches its sprite's edge (the chest, the market stalls) is outlined on every side too.
Every frame the highlighter tells the shader the sprite's own area in its texture, so slices
of a sheet, such as the bench in the village tileset, never pick up neighbouring tiles. The
ring colours are properties of the material.

Targets without art (no Target) are not highlighted. Highlighted sprites must use the
default lit sprite material and the Full Rect mesh type; anything else fails with an error
that names the sprite.

`InteractionHighlight.mat` (a pulsing glow) is the earlier highlight. It is kept for
comparison and is not used.
