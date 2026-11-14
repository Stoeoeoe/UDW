# Cutscene sounds

The Audio category offers one **Play sound** action with **Global** (2D) and
**At position** (3D) choices. It starts one non-looping sound on Unity's existing
SFX track and continues immediately. It is available in Before start,
Sequence, and On completion; skipping bypasses remaining sequence sounds and
still runs completion sounds. Already-started sounds finish naturally.

In Unity, create a **Game → Audio → Sound** asset, assign a namespaced sound ID
(for example `base:door-close`) and an audio clip. The shared SoundCatalog
discovers these assets; disabled definitions are excluded. Regenerating bindings
exports `resources.sound` with the stable ID and asset name. Vulcanus uses the
existing generic resource selector, preserving unresolved IDs as errors.

```json
{
  "id": "door-close",
  "action": "audio.playSound",
  "arguments": {
    "sound": "base:door-close",
    "position": { "anchor": "door" }
  }
}
```

The position also accepts `{ "x": 168, "y": 104 }` via the shared Grid/Pixel
picker. Global playback saves `"position": null`. Unity exposes one
`Audio.PlaySound(sound, position)` session action; pass `nil` for global playback.
The position parameter exports `nullable: true`, so the shared editor shows the
Global/At position choice from metadata. Required position parameters retain their
existing behavior and reject null. No raw-Lua sound calls or
editor-specific audio API knowledge are needed. Their schematic preview has
`spatialState: "described", effects: []`, preserving character state.

The sound catalog initially has no definitions. Add the desired clips using the
asset menu above; existing arbitrary AudioClips are not automatically assigned
gameplay IDs. Positional playback uses the existing sound manager's default
distance rolloff and the current AudioListener.
