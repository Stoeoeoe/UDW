# Apollo

MIDI + SoundFont → editable cue configuration → aligned stems + Unity MusicCue.
The same TypeScript functions back the CLI and can be called by Vulcanus later.

## First import

Install Node.js 22+, the [FluidSynth CLI](https://github.com/FluidSynth/fluidsynth/releases),
and FFmpeg with libvorbis on PATH. Alternatively set `APOLLO_FFMPEG` to its executable.
Use the local portable installation in `Apollo/tools/fluidsynth/bin`, put FluidSynth
on PATH, or set `APOLLO_FLUIDSYNTH` to its executable path. The local tools directory
is ignored by Git; a fresh checkout needs this development prerequisite. From `Apollo`:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run apollo -- import "C:/Music/forest.mid" --soundfont "C:/Music/orchestra.sf2" --id mymod:forest
```

This command copies the MIDI, registers the SoundFont in the local library,
discovers note-bearing tracks and their instruments, infers the loop, creates an
editable config, renders stems, and publishes the Unity import source. No Unity
Editor or Vulcanus UI is required to render. Unity imports the result when open.
`--fluidsynth <executable>` can also be passed directly.

`--id` is the stable content identity. It determines both directories:

```text
Apollo/
  soundfonts/orchestra.sf2             shared local SoundFont library
  mymod/stems.json                     generated index of shared stems and cue uses
  mymod/forest/
    source.mid                        original MIDI
    config.json                       editable instruments/grouping/loop/mixes
    instruments.json                  SoundFont preset names, banks and programs

Assets/Content/Music/mymod/forest/
  cue.apollocue                        generated manifest, imported as MusicCue
Assets/Content/Music/mymod/_stems/
  <stem>--<instrument>--<hash>.ogg     shared, aligned audio, stored once per namespace
```

Use any namespace; the base game uses `base`. Namespaces and cue names accept
lowercase letters, digits, hyphens and underscores. There are no revision folders
or manually chosen export destinations. SoundFonts stay outside the Unity build
and are ignored by Git; distribute only fonts you have permission to distribute.
Two different fonts with the same filename are rejected rather than overwritten.

## Change instruments and regenerate

Open `Apollo/mymod/forest/config.json`. Each detected track gets a named stem and
an explicit SoundFont selection when its MIDI channel uses one fixed instrument:

```json
{
  "id": "melody-1",
  "name": "Melody",
  "tracks": [1],
  "instruments": [
    { "channel": 0, "preset": "Flute" }
  ]
}
```

Change `preset` to a name from `instruments.json`, then rerender:

```powershell
npm.cmd run apollo -- render mymod:forest
```

The same cue is updated; identical rendered stems are reused across cues, and the
cue's Unity GUID is preserved. `stems.json` lists which cues use each shared Ogg.
The filename hash identifies the rendered PCM before encoding, so identical layers
reuse an existing file even when the encoder writes a different container serial.
A failed render leaves the
previous Unity export intact. A second `import` for an existing ID is refused;
edit its existing config instead. Replace `source.mid` to update the composition.

List instruments or inspect MIDI without importing:

```powershell
npm.cmd run apollo -- instruments "soundfonts/orchestra.sf2"
npm.cmd run apollo -- inspect "mymod/forest/source.mid"
```

Preset names must match exactly and be unique in the selected font. When names
are duplicated, use an explicit selection instead:

```json
{ "channel": 0, "bank": 0, "program": 73 }
```

Channels, MIDI tracks and program numbers are **zero-based**. Bank selection uses
MMA's `CC0 * 128 + CC32` convention. Percussion defaults to channel 9/bank 128.
Selections override program/bank changes throughout that stem. Channels with
multiple authored patches are initially left MIDI-driven; add a selection to
override them. All patches actually used during rendering must exist in the font.
Missing/ambiguous instruments fail clearly; FluidSynth's substitute instruments
are never accepted silently. If the initial MIDI patch is absent, the generated
config and inventory remain available to choose a replacement and rerender.

## Tracks, loops and mixes

- By default every note-bearing MIDI track becomes one stem. Pass `--tracks 1,3`
  on initial import to select tracks; the rest are recorded in `ignoreTracks`.
  Later, combine track indices under one stem or split them in `config.json`.
  Each note-bearing track must occur exactly once across stems and ignored tracks.
- Track names become readable stem names with an index suffix for unique filenames.
  Rename stem IDs deliberately: mix preset gains refer to those IDs.
- Tempo and meter come from MIDI. Missing events use MIDI's standard 120 BPM/4/4.
  The current Unity transport requires fixed tempo and meter; export rejects changes.
- Bar-aligned MIDI markers `loop:start` and `loop:end` define an explicit loop.
  Otherwise the nearest complete bar to the final note release is used, extending
  it if necessary to include every note onset. This is a starting point for audition,
  not a guarantee of the intended musical seam. No leading silence is trimmed.
- `loop.startBar` is one-based; `loop.endBar` is exclusive. Bars 1–8 use
  `{ "startBar": 1, "endBar": 9 }`. Edit these values to correct an inferred loop.
- `loop.tail: "wrap"` carries releases beyond the musical endpoint into the opening.
  New notes beyond the endpoint are excluded. `"cut"` truncates at the endpoint.
  Wrapped loops include that release on the first playback too. Clipping fails the
  export; lower `gain` instead of normalizing stems independently.
- `loop.fadeOutSeconds` applies one linear ending fade to every stem. Default 0;
  set it explicitly when the musical ending should fade before restarting.
- `soundFont` resolves relative to the config. A stem's optional `soundFont` can
  select another font. Regenerate its inventory with `instruments <font>`.
- `sampleRate` defaults to 48000, `gain` to 0.2. Reverb/chorus are disabled. The
  renderer uses a sample clock and one synthesis core; each process has a ten-minute
  timeout. Reuse the same font bytes and FluidSynth build for reproducibility.
- `presets` define named mixes. Every mix lists every stem with a gain in [0,1],
  including muted stems. Omit presets to generate a `full` mix with every gain at 1.
- `theme` is an optional namespaced ID shared by arrangements of the same music.
  Give related cues the same theme ID, MIDI timing, loop, sample rate and fade.
  Unchanged tracks rendered with the same SoundFont and settings share a stem and
  keep playing during a transition; changed instruments join at the same position.
  Without `theme`, the cue ID is its own theme. Different themes crossfade normally.

Apollo renders aligned stereo PCM internally and publishes Ogg Vorbis stems with
identical sample rates and frame counts. Unity compresses them in builds and
decompresses them when loaded, so playback does not decode every frame. This saves
disk space but still uses uncompressed audio memory during play.
The manifest records IDs, timing, presets, grouping, resolved instruments, renderer
settings and SHA-256 hashes. SF2/SF3 preset headers are read without loading their
sample pools into Node memory. Asynchronous format-2 MIDI, SMPTE timing, SysEx,
multiple MIDI ports and meters with fractional quarter-note beats are unsupported.

## Use in the game

Unity automatically imports `cue.apollocue` into a validated `MusicCue` and sets
stem import settings to Vorbis, Decompress On Load, Preload Audio Data, Preserve
Sample Rate, and Load In Background off. The cue is discovered by `MusicCatalog`
and exported to scripting resources. No cue-specific C# or registration is needed.

In Vulcanus map metadata, set **Music Cue** to the content ID (e.g. `mymod:forest`)
and **Music Preset** to a configured mix (e.g. `full`). The map importer creates its
`MusicEnvironment`. Assigning a cue to a location is an explicit authoring choice;
the CLI does not guess which map should play a newly imported song.

The editable source of truth is `config.json` plus `source.mid` and the SoundFonts.
Treat the Unity cue folder as generated output. For playback and Lua actions see
[the music contract](../Assets/Core/Music/README.md).

## Verification

```powershell
npm.cmd test
# Include actual FluidSynth synthesis in the tests:
$env:APOLLO_FLUIDSYNTH = 'C:/Tools/FluidSynth/bin/fluidsynth.exe'
$env:APOLLO_SOUNDFONT = 'C:/Music/orchestra.sf2'
npm.cmd test
```

Tests cover preset discovery/selection, MIDI track/controller grouping, musical
boundary inference, output alignment/tail wrapping/fades, canonical replacement,
GUID metadata preservation, cleanup on failure, CLI errors and reproducible audio.
Unity `ApolloCueImporterTests` checks automatic audio setup and stable cue identity
across reimports. Musical seams still need listening after changing a score or font.
