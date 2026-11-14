# Screen shake

Choose **Camera → Screen shake** in Before start, Sequence, or On completion.
Set `durationSeconds` (gameplay seconds) and `strength` (camera displacement in
world units). Start with `0.5` and `0.1`. Both must be finite and nonnegative.

The action starts a smooth, fading shake and continues immediately. A new shake
replaces the previous one; zero duration or strength stops it. Insert a Wait step
if the sequence should wait for the effect. Skipping bypasses remaining sequence
shakes; an already-started shake finishes naturally unless replaced or stopped.

```json
{
  "id": "rumble",
  "action": "camera.shake",
  "arguments": { "durationSeconds": 0.5, "strength": 0.1 }
}
```

Unity exposes `Camera.Shake(durationSeconds, strength)` as a session action.
`CameraManager.Shake(durationSeconds, strength)` and `StopShake()` are also available
to C# callers. The manager adds a Cinemachine noise-stage extension to its follow
camera and cameras activated through `ActivateVCam`. It applies a transient
camera-space position correction, preserving follow targets and authored
transforms. Location leave and manager disable clear the effect.

Bindings export `camera.shake` with numeric parameters and
`preview: { "version": 1, "spatialState": "described", "effects": [] }`.
Vulcanus uses the existing generic action and number controls; its schematic
map preview remains stationary and does not simulate camera shake.
