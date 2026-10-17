# Interaction slots: bench prototype

An InteractionSlot describes one exclusive character position. Its Transform is
the occupied anchor; it holds the exit, facing, animation and feedback settings and
tracks its occupant. CharacterOccupation owns the character's use of that slot:
the entry/exit phase, motion, animation, physics and lifecycle cleanup.
SeatInteractable starts entry through the normal pointer/proximity action.
A bench with several seats can have several interactable/slot pairs; no global
registry or reservation system is involved.

## Try it

A Bench Prototype instance sits beside the bed in SampleScene. Click it through
the normal interaction action to hop on. Press Interact (Space / gamepad south)
or the primary action to hop off. Opening a menu suppresses the exit request.
The bench itself is a simple placeholder; PrototypeSittingPose is an explicit,
compressed version of the player's down-facing idle art, not a finished sitting
animation. Replace the assigned pose with an authored clip when that art exists.

## Authoring

Use BenchPrototype.prefab as the working example:

- Place the slot at the character's occupied position and set its facing.
- Assign an Exit Point in clear standing space and an Occupied Animation definition.
- Set Hop Duration and Hop Height. The character root moves along the ground;
  the graphics follow the hop arc.
- Optional Entry Feedback and Exit Feedback accept the existing MMFeedbacks /
  MMF_Player components for sound, particles, or object reactions. They fire when
  each hop starts and do not determine when the hop finishes.
- Assign the slot to its SeatInteractable and use a trigger collider for targeting.

Slots validate their required configuration in Awake. GameCharacter requires a
CharacterOccupation component, which uses the character's existing controller,
graphics, orientation and animator references. The player prefab also includes
CharacterOccupationAbility to accept exit requests while normal abilities
are blocked. Missing configuration is a setup error, never an unavailable-seat
fallback.

## Animation definitions

Create assets through Game > Character > Animation or Animation Set. Both derive
from CharacterAnimationDefinition, so either fits the slot's single Occupied
Animation field. Each has a stable lowercase namespace:name ID (for example,
base:prototype-sitting). IDs identify content; this feature does not add a mod
loader or a runtime registry. Locomotion and tool clip lookup are unchanged.

A CharacterAnimation references one clip and respects its authored loop setting.
A CharacterAnimationSet references a base CharacterAnimation, an optional list of
weighted one-shot animations, and a positive min/max delay in scaled seconds.
After each delay, the animator selects a variation, plays it once, returns to the
base animation and schedules another delay. Empty variation lists just play the
base. Weights are relative and belong to the set, not to the shared clip definition.

Validation rejects missing references, invalid IDs/timing/weights, and looping or
zero-length variation clips. Playback state lives in each UrCharacterAnimator,
never in the shared assets. Exit, release, disable and location leave discard the
schedule, so an old variation cannot restart occupation playback. The prototype
bench references PrototypeSittingAnimation.asset, which wraps the existing pose;
whistling/look-around clips can be authored and added to a set later.

## Lifecycle

Call character.Occupation.TryEnter(slot) to claim both sides immediately: the
slot's Occupant and the occupation component's CurrentSlot. It rejects an
unavailable slot, an already occupied character, or a dead character. The
component's phase spans Entering, Occupied and Exiting. TryExit keeps the claim
until arrival. Availability notifications observe both linked sides after the
change is complete. A second entry or premature/repeated exit cannot interrupt
a hop. SeatInteractable returns the entry result to the shared interaction flow;
only a successful entry consumes a use, starts cooldown or plays activation feedback.

Occupation blocks ordinary character abilities without changing ConditionState
or disabling global input. Physics simulation is suspended while position is
controlled by the slot. Animancer holds the occupied clip after entry and normal
animation handling resumes on exit. Completion restores graphics and re-enables
physics simulation before freeing the slot. The body and moved Transform share
the same character root.

CharacterOccupation.ReleaseImmediately is the interruption path. The component
listens for death and location leave and releases itself on disable. Disabling
the seat/slot also asks its occupant to release. These paths use neither an exit
hop nor exit feedback; GameCharacter does not forward their cleanup calls.
An interrupted entry returns to its starting position; an interrupted exit snaps
to the authored exit point. A character already seated stays in place on immediate
release. Location leave releases without repositioning, since location placement
owns the next destination. Cleanup never changes condition or revives a dead
character. Occupancy is runtime-only; no save format changes are included.

This first implementation covers stationary seats. Bed ownership, sleep behavior,
reservation while approaching, moving vehicle attachment, and persisted
occupation remain separate work.
