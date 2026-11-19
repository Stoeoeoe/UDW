# Apollo

MIDI + SoundFont → editable cue configuration → aligned stems + Unity MusicCue.
Vulcanus calls these TypeScript functions directly from its Music editor.

## Import

Install Node.js 22+ and run `npm ci` in `Tools/Apollo`. Synthesis (FluidSynth compiled to
WebAssembly, via `js-synthesizer`) and Ogg encoding (`ffmpeg-static`) are npm dependencies,
so nothing else needs installing. Set `APOLLO_FFMPEG` to use a different FFmpeg build.

In Vulcanus, use **New > Music** and pick a MIDI file and a SoundFont. The cue source belongs
to the open Vulcanus project and lives in its `music` folder. Import copies the MIDI,
registers the SoundFont in the local library, discovers note-bearing tracks and their
instruments, infers the loop, creates an editable config, renders stems, and publishes the
Unity import source. Unity imports the result when open.

The cue ID (`namespace:cue-name`) is the stable content identity. It determines both directories:

```text
Assets/Vulcan/<project>/music/
  mymod/stems.json                     generated index of shared stems and cue uses
  mymod/forest/
    source.mid                        original MIDI
    config.json                       editable instruments/grouping/loop/mixes
    instruments.json                  SoundFont preset names, banks and programs

Tools/Apollo/
  soundfonts/orchestra.sf2             shared local SoundFont library

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

Open `<project>/music/mymod/forest/config.json`. Each detected track gets a named stem and
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

Change `preset` in the Music editor (or in `config.json`), save, and press **Render**.

The same cue is updated; identical rendered stems are reused across cues, and the
cue's Unity GUID is preserved. `stems.json` lists which cues use each shared Ogg.
The filename hash identifies the rendered PCM before encoding, so identical layers
reuse an existing file even when the encoder writes a different container serial.
A failed render leaves the
previous Unity export intact. A second `import` for an existing ID is refused;
edit its existing config instead. Replace `source.mid` to update the composition.

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

- By default every note-bearing MIDI track becomes one stem. The import dialog lets
  you uncheck tracks, which go in `ignoreTracks`. Afterwards, the **Source MIDI** section of the
  Music editor moves each track to another stem, a new stem or the ignored tracks (or edit
  `config.json`). A moved track keeps its instrument, and stems left empty are removed.
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
  timeout. Reuse the same font bytes and Apollo version for reproducibility.
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
sample pools into Node memory. Asynchronous format-2 MIDI, SMPTE timing, SysEx (except GM System On),
multiple MIDI ports and meters with fractional quarter-note beats are unsupported.

## Use in the game

Unity automatically imports `cue.apollocue` into a validated `MusicCue` and sets
stem import settings to Vorbis, Decompress On Load, Preload Audio Data, Preserve
Sample Rate, and Load In Background off. The cue is discovered by `MusicCatalog`
and exported to scripting resources. No cue-specific C# or registration is needed.

In Vulcanus map metadata, set **Music Cue** to the content ID (e.g. `mymod:forest`)
and **Music Preset** to a configured mix (e.g. `full`). The map importer creates its
`MusicEnvironment`. Assigning a cue to a location is an explicit authoring choice;
Apollo does not guess which map should play a newly imported song.

The editable source of truth is `config.json` plus `source.mid` and the SoundFonts.
Treat the Unity cue folder as generated output. For playback and Lua actions see
[the music contract](../../Assets/Core/Music/README.md).

## In Vulcanus

The **Music** editor in Vulcanus lists the project's cues, imports a MIDI + SoundFont, shows and
replaces the source MIDI, edits loop, instruments and mixes, previews the mix and renders.
It runs this code inside Electron (`Tools/Vulcanus/app/electron/musicHandlers.ts`).

## Verification

```powershell
npm.cmd test
# Include actual synthesis in the tests:
$env:APOLLO_SOUNDFONT = 'C:/Music/orchestra.sf2'
npm.cmd test
```

Tests cover preset discovery/selection, MIDI track/controller grouping, musical
boundary inference, output alignment/tail wrapping/fades, canonical replacement,
GUID metadata preservation, cleanup on failure and reproducible audio.
Unity `ApolloCueImporterTests` checks automatic audio setup and stable cue identity
across reimports. Musical seams still need listening after changing a score or font.
