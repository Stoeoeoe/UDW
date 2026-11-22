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

`InteractionSensor` makes both picks from the candidates its nearby sensor detects.
`PlayerInteractionContextSnapshot.ActionableInteractable` is the result.

## Authoring

Set **Target** on every interactable that has art of its own. It is the object holding the
interactable's sprites and solid colliders, usually the prefab root. For a character it is
the character root, even when the interactable sits on a child with a larger talk trigger.
Leave it empty for things without their own art, such as doors and map triggers: the
interaction collider is then used for both hovering and reach.

Select an interactable to see its gizmo. Cyan shows what the pointer hovers (sprite bounds,
or the interaction collider) and yellow shows the footprint.

Hovered sprites need **Read/Write** enabled on their texture. A sprite without it fails with
an error that names the sprite when the pointer reaches it. Crops set their target in code
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
