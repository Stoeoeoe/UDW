# Pixel water

Vulcanus tile metadata `waterType` selects a `WaterProfile` at
`Assets/Content/Water/<waterType>.asset`. Missing metadata and `None` mean ordinary
tiles. `Lake_1` ships with the initial lake palette; add a profile with the exact
enum option name for another type. Missing profiles and invalid settings fail
import, Play Mode validation, or build validation instead of silently using a default.

On map import, four-neighbour connected tiles of the same type within each source
layer become separate `WaterBody` child tilemaps. Diagonal contact does not join
bodies. Each body has its own renderer and profile reference; duplicate a profile
and assign it as a scene prefab override to tune one body independently. Imported
region names use the type and first cell, so repainting the footprint can change
that name; check scene overrides after changing region topology.

The original tiles remain in their source layer, with transparent per-cell color,
so collision, terrain and freshwater lookup keep working. The water surface uses
plain, collider-free tiles containing the original sprite's alpha mask. RGB is
ignored: a pink placeholder works without color recognition. Transparent pixels
remain transparent, including shoreline cutouts. Other decorations should stay on
ordinary tiles/layers.

Edit `Assets/Content/Water/Lake_1.asset` to change the four opaque palette colors,
wave speed/scale, caustic intensity/scale and flow direction. Profile edits refresh
loaded bodies in the Editor. Each body applies a property block when enabled;
runtime callers changing a profile must explicitly call `WaterBody.ApplyProfile()`.
The shared material is never instantiated or mutated per frame.

`PixelWater.shader` uses URP's lit sprite composition, including global day/night
lighting, local 2D lights, renderer tint and a flat normal pass. The surface is
drawn with the map before camera post-processing and fullscreen weather overlays.
The palette describes base surface colors; lighting and camera effects modulate
the final colors. Animated patterns use world XY snapped
to the imported project's pixels per tile (one tile is one world unit), while mask
sampling preserves the sprite's atlas UVs. Source layer opacity and renderer
sorting are retained. It needs no noise texture, simulation or save state.
Optional object reflections use one temporary color capture per camera.

## Shoreline geometry

Map import rasterizes water sprite alpha at the project's logical pixel resolution.
All water types/layers contribute to occupancy, so touching water regions do not
create a false coastline between them. Transparent holes and unpainted cells inside
the map are land; outside the map is open water. The map's logical rectangle uses
the importer's top-centre sprite pivot and half-cell anchor convention.

Each body references a `WaterShorelineData` subasset. A sparse page table addresses
128×128-pixel, point-filtered RFloat distance slices. Only occupied chunks get a
slice. Padded Euclidean transforms agree at chunk joins and store distance from
the nearest land-pixel boundary, capped at the map importer's **Shoreline Distance
Pixels** (32 by default, configurable from 1 to 128). The shader samples these in
body-local logical pixels, including sprite pivot offsets; it never checks neighbours.

Chunk transforms are content-cached under `Library/WaterShorelines`. Reimporting an
unchanged chunk or editing appearance settings reuses its distance data. Geometry,
alpha, map-boundary and range changes invalidate the affected padded chunks. Unity
also caches the complete imported map artifact. A clean checkout rebuilds this
derived cache; it is not save data. Texture-array/page-table limits fail import
clearly rather than silently dropping geometry.

## Effect controls

All new effects default off on newly created profiles. The shipped `Lake_1` opts
into restrained shoreline foam/waves, surface highlights and object reflections,
with currents off. Disable `shorelineEnabled`, `flowEnabled`,
`surfaceHighlightsEnabled` and `objectReflectionsEnabled` to retain the
original surface animation exactly.

- **Shoreline:** the master toggle gates foam, incoming waves and shallows. Each
  also has its own toggle. Widths are in logical pixels and must fit the baked
  range. `foamIntensity` controls patch coverage; `foamSpeed` animates those
  patches. `shoreWaveFrequency` is bands per pixel, `shoreWaveWidth` is band
  thickness, and `shoreWaveSpeed` is pixels per second towards land. Incoming waves
  fade out within half their spacing from land, keeping the pond interior free of
  nested coastline outlines. Zero coverage,
  width or frequency disables that effect. Optional shallow water uses `waveColor`.
- **Currents:** `flowDirection` is the existing vector, `flowSpeed` is world units
  per second and `flowStrength` scales it. Enabling this adds directional drift to
  both ripples and caustics without changing the shoreline clock. A zero vector,
  speed or strength is stationary additional flow. Disabling it preserves the
  existing drift and animation.
- **Optional flow map:** assign `flowMap` to replace the additional uniform current
  with painted directions. `flowEnabled`, `flowSpeed` and `flowStrength` still gate
  and scale it. Red/green encode world X/Y: 0 is -1, 128 is zero, and 255 is +1.
  Blue scales local speed from 0 to 1; blue zero is a stationary additional current.
  Alpha is unused. Base ripple/caustic animation continues independently.
  `flowMapWorldOrigin` places the bottom-left corner in world XY;
  `flowMapWorldSize` is its positive width/height in world units. Texture edges extend
  outside that rectangle. Use a separate profile/override for independently painted
  bodies. Sampling uses the same snapped world pixels as the water, across all tiles
  and chunks. Two bounded scroll phases alternate through stable pixel dithering,
  avoiding growing distortion and extra palette colors. Removing the map restores
  the original uniform flow. Zero speed/strength or disabling flow preserves the
  original appearance even when a map is assigned.

  Import painted maps as **Default**, **sRGB off**, **Compression None** (RGB24 or
  RGBA32), **Generate Mip Maps off**, **Filter Mode Point**, **Wrap Mode Clamp**.
  Keep these settings on platform overrides too. Read/Write is unnecessary. Invalid
  data settings fail profile validation before play/build instead of changing the
  encoded velocities silently. Editing a flow map needs no shoreline regeneration.

  Example RGB bytes: east `(255,128,255)`, west `(0,128,255)`, north
  `(128,255,255)`, south `(128,0,255)`, still `(128,128,0)`. Halve blue for
  half-speed regions. Paint gradual direction changes through river bends;
  hard changes in the data intentionally make hard changes in current direction.
- **Surface highlights:** discrete stretched streaks suggest surface light, using
  `waveColor` rather than adding RGB brightness. Intensity controls their temporal
  visibility, density their spatial coverage, scale their frequency, speed their
  animation, and `surfaceHighlightStretch` their directional proportions. They remain
  palette-constrained and receive the same lighting as the rest of the water.
- **Object reflections:** `objectReflectionsEnabled` mirrors registered scenery
  and character sprites around each object's authored ground anchor. It captures
  the actual current sprite, flip, tint, transform and animation, independently of
  terrain. `objectReflectionOpacity` controls pixel coverage; zero disables it.
  `objectReflectionRipplePixels` and `objectReflectionRippleSpeed` add snapped
  horizontal distortion. Source RGB is mapped to the nearest of the four water
  colors, then receives the water's normal day/night lighting, local lights,
  renderer tint, post-processing and weather overlays. Water sprite alpha clips
  reflections at banks and holes; normal sprite sorting keeps foreground objects
  in front. Foam remains part of the surface pattern.

## Reflecting objects

`WaterReflectionRendererFeature` on the URP 2D renderer owns the capture material
and maximum reflection distance (world units). Reflections fade down from each
object's ground anchor over that distance. It draws registered sprites into an
RGBA texture, transitions it for sampling before 2D sprites, and retains it until
after all sprite batches. Capture data is camera-local, point-filtered and cleared
each frame, including frames with no contributors. There is no scene-wide renderer
search per frame and no extra camera or simulation.

Imported Vulcanus object definitions receive `WaterReflectionSource` automatically;
their bottom-centre pivot is the ground anchor. The character prefab also has a
source bound to its graphics foot pivot. For another prefab, add the component
under an inactive root, assign a stable ground `Transform` and all relevant
`SpriteRenderer` visuals, then enable it. Runtime factories use `Configure` before
enabling. Empty animation/equipment sprite slots and hidden renderers are valid.
Disabling/removing a source unregisters it; deleting/moving/changing a sprite is
reflected on the next render. A sprite can belong to only one source.

Terrain tilemaps, painted background tiles, UI, particles and unregistered sprites
are excluded. A building painted as terrain must be authored as a Vulcanus object
or a sprite prefab to reflect as one object with one ground anchor. Sources support
Simple SpriteRenderers without SpriteMask interaction. Custom material effects
are not reproduced by the capture shader. Required source references and renderer
feature/material setup are validated before play/build.

Runtime terrain editing is not implemented.
The editor shoreline builder is separate from runtime presentation, so future
terrain-editing work can regenerate affected chunks through that preprocessing
boundary without putting neighbour polling in gameplay.
