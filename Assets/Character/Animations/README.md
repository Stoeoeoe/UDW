# Character emotes

Create an emote with **Assets > Create > Game > Character > Emote**. Give it a
stable namespaced ID, a positive duration in scaled seconds, and a character
animation, a callout sprite, or both. The shared EmoteCatalog discovers definitions
throughout Assets; its enabled entries appear in Vulcanus's emote selector after
the Lua bindings export. Emotes are presentation content, not saved player state.

**Playback Speed** scales animation motion: 1 is normal speed, 0.5 is half speed,
and 2 is double speed. New definitions default to half speed. **Duration** is the
default total emote time; allow at least
the clip length divided by playback speed to show the whole gesture. The four
shipped gestures use half speed and durations matching their slowed clips.

Assign an optional **Sound** definition to play it once on the Sfx track at the
character's position when the emote starts, even if its animation is unavailable.
Animation speed does not change audio pitch. Like other one-shot sound actions,
the sound finishes naturally; ending or cancelling the emote does not cut it off.

Use a CharacterAnimation with a Memao action to reuse an emote across character
libraries. Playback resolves the performing character's current facing. If that
library lacks the directional clip, playback warns once and still displays the
icon for the full duration. Invalid definitions and unknown emote IDs fail during
authoring/binding; they are not treated as missing character animations.

The callout uses the sprite's pixels-per-unit and the emote's offset from the
character's graphics origin (feet). It follows the character and draws above its
body within the character's sorting group. Looping animations continue for the
duration; finite animations retain their final pose until the duration ends.

In a timed Lua sequence:

```lua
Characters.Emote("player", "mymod:surprised")
Characters.Emote("player", "mymod:surprised", 2.5) -- Override duration for this play.
Characters.Emote("player", "mymod:surprised", 2.5, 0) -- Skip the pause after it.
```

The visual action is `characters.emote`, with `character`, `emote` and optional
`durationSeconds` and `pauseAfterSeconds` arguments. Omit duration or use zero for the definition's default;
positive values override it. Negative and infinite durations are rejected.
It is available in cutscene and NPC-routine sequences. It waits for the authored
duration, releases the animation and callout, then pauses for one scaled second
before the next action. Override `pauseAfterSeconds` to adjust this breathing room;
zero skips it. Cancellation and skip release presentation immediately, including
during the pause. This pause is separate from the gesture's duration.
Timed actions cannot run in synchronous dialogue action/condition chunks.
