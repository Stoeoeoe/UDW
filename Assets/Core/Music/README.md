# Adaptive music

`MusicCue` assets describe stems, tempo, beats per bar and loop bars. A stem
is one independently controllable layer of a song. A preset is a named mix that
assigns a volume to every stem. Cues with the same theme ID are arrangements of
one timeline: identical audio stems keep playing, while different stems fade in
and out at the current position. Their tempo, meter and loop length must match.
Unrelated themes crossfade as separate songs. `MusicCatalog` uses the
shared enabled-definition discovery pipeline and namespaced cue IDs. The two
`base:music-prototype-*` cues are offline generated audio fixtures, not final music.
Recreate missing fixtures with **Tools > Music > Create prototype cues**.

Add `MusicEnvironment` to a location scene and assign a cue and preset. It submits
a request after scene services initialize and releases it on disable/unload.
Area changes begin at the next safe audio scheduling point by default, followed by
a one-second fade; they do not wait for a beat or bar. Shared stems continue in time.
Changed stems in related arrangements use an equal-power crossfade to reduce the
perceived dip as their volumes pass through the midpoint.
Reentering a location after loading a save reconstructs that environmental request;
no audio position, transient override or extra save data is persisted. Game state
callers can use `SetPreset`, or own a request handle for temporary zones/events:

```csharp
// Inject MusicDirector into this caller as music.
var request = music.Requests.Request(cue, "active", priority: 10,
    quantization: MusicQuantization.NextBar, fadeSeconds: 1);
request.Update(cue, "intense");
request.Dispose(); // Releases only this request; safe to call twice.
```

Highest priority wins; most recent submission/update wins ties. Hidden requests
keep their latest selection. The director persists across scene loads. Requests
must have a concrete owner that disposes them. Validation belongs at content
setup/import (`RequireValidConfiguration` for runtime mod assets), and unknown
presets fail at the request boundary. Catalog IDs never assume base-only content.

Cutscene actions `music.override` / `Music.Override(cue, preset, quantization,
fadeSeconds)` and `music.release` / `Music.Release()` run in all cutscene phases.
They are session actions, not synchronous Run Lua functions. Overrides have
priority 1000, are owned by the active run, and release even on skip, cancellation,
location leave, disabled runner or exceptions. Preset names are cue-local;
`musicCue` choices are exported to the shared Vulcanus bindings manifest.

Playback schedules every stem at one double-precision DSP timestamp. Sources
loop continuously, including at zero gain; preset edits never seek/restart them.
Beat/bar boundaries use the outgoing cue's fixed epoch and include at least two
DSP buffer windows of preparation (minimum 100 ms). Immediate means earliest
safe scheduled start, not the current render frame. A stale future transition is
canceled; an audible crossfade finishes before applying the latest request. This
keeps at most two groups. Linear crossfades and preset ramps use DSP time, with
gain updates once per frame; transitions start sample accurately, gain automation
is not sample accurate. Destroyed groups stop sources before Unity's deferred
object destruction. Audio device reset rebuilds playback at a fresh epoch.

Sources route into the existing MMSoundManager **Music** bus. Use its existing
mute/volume APIs or `MusicDirector.SetUserVolume` for normalized user volume;
mute does not dispose requests or stop transport. Music continues through
`Time.timeScale = 0`, including cutscene skip prompts. `AudioListener.pause`
pauses sources and the DSP clock together. Do not individually pause stems.
Audio settings must provide enough real voices for both groups (eight voices for
the included four-stem fixtures) plus foreground game sounds.

The cue Inspector validates configuration and previews all stems through the same
playback engine. Change **Preview preset** while playing to hear gain blending.
Closing the Inspector, script reload, or changing Play Mode stops preview.
Preview is available only in Edit Mode so it cannot add voices to live gameplay.
The director Inspector reports winner/priority, requests, groups, beat and the
scheduled transition timestamp.

## DAW export

- Export all stems from the same timeline origin through exactly the same loop
  end. Include silent regions; never trim each track independently. Bake tails
  into the loop deliberately and audition the seam in the DAW.
- Use one sample rate and identical sample-frame counts. Export lossless WAV,
  no encoder padding, normalization, leading silence removal or per-stem tempo
  changes. Align the loop length to BPM × meter × bar count (one-sample tolerance).
- Import with Decompress On Load, Preload Audio Data enabled, Load In Background
  disabled, Preserve Sample Rate. Mono or stereo is supported. Apollo's Ogg stems
  preserve loop length in Unity; audition lossy audio for quality. Keep sufficient headroom.
- Author a stable namespaced cue ID and unique stem/preset names; every preset
  lists every stem, including zero gains. Inspect validation before play/build.

## Verification

`MusicTests` covers long-running transport arithmetic, exact boundaries, request
priority/tie ordering, release/clear, invalid requests, content validation,
non-restarting mix ramps, canceled scheduling and bounded playback groups.
`MusicPlaybackTests` runs the actual DSP/audio engine across frames and repeated
loops. A separate explicit ten-minute test exercises prolonged loop alignment.
Cursor checks require persistent one-sample alignment across consecutive frames;
Unity can expose a partially processed buffer when querying individual sources
from the main thread. Save open scenes before using Unity's standard Test Runner.

```powershell
unity command run_tests --caller plugin --skill unity-cli --mode editor --filter Core.Music.Editor.MusicTests
unity command run_tests --caller plugin --skill unity-cli --mode editor --filter Core.Music.Editor.MusicPlaybackTests.LoopsMixesPauseAndRapidTransitionsUseRealDspPlayback
```

Manual audible stress check: preview Courtyard calm/active/intense, then Temple;
listen for loop seams and isolated stems drifting. In Play Mode switch environment
requests rapidly before/after a scheduled bar, override with a cutscene, then skip
and cancel it; inspect return to the latest environment. Disable/unload the scene
owner, mute/unmute Music, pause with time scale and AudioListener separately, and
load a save then enter a location. Verify no stale requests and at most eight
playing stem sources. Profile audio voices/CPU/memory with both groups playing;
the PCM fixture clips are deliberately short. Automated source/sample checks do
not replace listening to final production exports on target hardware.

Verified in Unity 6000.6.7f1 on Windows at 48 kHz / 1024-sample DSP buffers:
15 music/catalog/Lua contract checks passed. Live assertions passed for preset
fades, rapid transitions, both pause policies, cutscene completion/skip/cancel/
release, scene unload and mixer mute. Both prototype cues ran for 120 seconds
each without persistent sample drift, including their zero-gain stems. The
four-stem runs used four sources; transition stress remained bounded to eight.
The explicit ten-minute variant and target-hardware listening remain available
for final production exports. Live assertions were invoked directly in ordinary
Play Mode to preserve unsaved scene changes that Unity's Test Runner wanted saved.
