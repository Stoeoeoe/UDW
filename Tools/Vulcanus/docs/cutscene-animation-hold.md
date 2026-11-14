# Hold an animation's final frame

Enable **Hold last frame** on **Play animation** to keep a finished pose, such as
a death animation. The step still waits for the clip to finish, then the sequence
continues while the last frame stays displayed. It does not keep the cutscene running.

```json
{
  "id": "fall",
  "action": "characters.playAnimation",
  "arguments": {
    "character": "player",
    "animation": "base:pass-out",
    "holdLastFrame": true
  }
}
```

The pose stays through idle/facing updates and completion placement. Walking,
running, starting another animation, a tool action, disabling the animator, or
leaving the location releases it. Cancelling a clip before completion releases
playback without holding its unfinished pose. Cutscene rollback also clears a new
held pose created by the failed/cancelled run. Stale playback handles cannot stop
a replacement animation. A successfully held pose can be explicitly released by
the existing `EndInteractionAnimation()` API.

Unity exports `holdLastFrame` as `type: "boolean", optional: true,
defaultValue: false`. Vulcanus uses a generic boolean switch; it saves a JSON
boolean, not a string. Existing authored steps may omit the argument and retain
normal playback. Unity compiles missing flags to `false`; direct session calls
can also omit the optional third argument. Explicit non-boolean values are errors.

`Characters.PlayAnimation(character, animation, holdLastFrame)` remains awaitable
and spatially unknown in the schematic preview. This option changes presentation,
not health/death state. The Map 1 Prototype enables it for its pass-out animation.
