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

## Ocean

`Ocean_1` uses `PixelOcean.mat` and the independent `UrdewValley/Pixel Ocean`
shader. Its surface has three layers: static stepped depth colour, broad broken
travelling swells, and an independent coastal wash that advances towards land and
dissolves behind its leading edge. It preserves the sprite mask, renderer tint,
2D lighting and flat normal pass.
`Lake_1` and `River_1` continue to use `PixelWater.mat` / `PixelWater.shader`.

`WaterBody` supplies the profile and baked shoreline through its property block.
The ocean Inspector shows only its supported controls. The four palette colours
provide the depth, swell and foam colours, with a few intermediate colour levels.
Broad shapes use the imported pixel scale (normally 16 PPU); thin crests and foam
use half pixels. Animation advances at `animationFps`. The shoreline bake is
interpolated across chunk boundaries before sampling on that half-pixel grid.

The ocean uses depth start/blend and static depth wobble; swell direction (including
the map override), wavelength, speed, crest thickness, breakup, curvature, stretch,
shading and fade distance. It does not use river flow, lake wavelets,
cross swell, surface glints, depth motion or the shared shader's smooth-fade toggle.

`causticIntensity` and `causticScale` control the animated light net in open water.
It is sampled on the logical pixel grid (normally 16 PPU), excluded from the beach
slope, and fades in towards deep water across the depth range.
`oceanWobblePixels` and `oceanWobblePeriod` gently deform caustics and
swells without moving the coastline or gameplay contacts; zero amplitude disables it.
`oceanBeachSlopePixels` fades water opacity from the coast to fully opaque water
over that many logical pixels. Zero restores the hard edge. Author ground beneath
the water (as on the shipped beach); the slope reveals that art rather than inventing
a sand colour. Breaking foam retains its own coverage over these transparent shallows.
The slope must fit within the baked shoreline distance range.

Coastal wash needs shoreline and foam enabled. `foamSpeed` is washes per second;
`surfPixels` is the reach from land and `surfWashPixels` the dissolving trail width.
Foam width/intensity control residual edge foam and wash strength. Weather sea state
widens the wash and adds restrained whitecaps. Wash remains independent of the swell
direction, so it travels towards shore around inlets and islands. It stays inside
the authored water mask; it does not animate water onto the land or move collision.
Object reflections retain captured colours with a water tint and half-pixel ripple
distortion. Gameplay ripples, contact foam and weather rain use the existing global
water interaction data. Reflections draw under coastal foam and interactions.

The feature descriptions below describe `PixelWater`; ocean behaviour is specified
above. Profiles and imported map references remain shared; no map reimport is needed.

## Drawn water layers

A Vulcanus layer of kind `water` holds hand-drawn **bodies** instead of tiles. Each body in
`waterBodies` has a stable `id`, a `waterType` (a profile name), `isFreshwater`, an optional
`bankProfile` and its drawn currents (`flow`). `waterMask` says which body every pixel
belongs to: `width`/`height` in logical pixels, which must equal the map size × tile size,
and `rle`, a flat list of `[value, run, ...]` pairs from the top-left, where value 0 is
empty and value n is `waterBodies[n - 1]`. A mask can address 255 bodies.

The importer cuts each body's pixels into one alpha-mask sprite per map cell (identical
cells share a sprite, packed into one readable atlas per layer) and feeds them to the
same pipeline as colour-keyed tiles. Each body is exactly one `WaterBody` named
`Water_<id>`, however its pixels connect, with its own profile and shoreline. All water
shares one occupancy, so neighbouring bodies never form a false coastline between them.
A body with no pixels creates nothing. Bank profiles are not implemented: a non-empty
`bankProfile` fails the import rather than being ignored.

Gameplay stays cell based. A cell that is more than half water gets an invisible
`VulcanusTile` in the layer's tilemap with full collision, and `isFreshwater` when the
body with the most pixels in that cell is freshwater. Cells with less water are walkable
and not freshwater. Pixel-accurate lookups and outline colliders are not implemented.
The layer draws no bank; the ground layers beneath show wherever the mask is empty.

## Smooth fades

By default every surface pixel is one of the four palette colours. `smoothFades` blends instead:
depth becomes a continuous gradient, shallows, the foam rim and foam blocks fade away from the shore,
and swell crests become soft bands with a faint trough that fade at their edges and stretch ends,
with surf foam washing out behind breaking crests. Wavelets, glints and interaction effects stay hard.

## Swell

`swellEnabled` adds travelling waves for oceans and large lakes. Crests run across
`swellDirection` (the direction they travel), `swellWavelength` pixels apart, advancing at
`swellSpeed` pixels per second in whole-pixel steps. Each crest is `swellCrestPixels` thick in
the Wave colour with a one-pixel trough behind it in Deep, broken up along its length by
`swellBreakup`; each stretch is thickest in its middle and thins to single pixels at its ends.
`swellStretchPixels` sets how long those stretches typically are. `swellMeander` curves crests
sideways along their length, `swellRipple` makes them undulate slowly as they travel, and
`swellCrossStrength` adds a weaker, shorter train at 35 degrees, so the swell does not look
mechanical. With smooth fades, `swellShading` rolls the whole sea gently lighter towards each
crest and darker between them, and crests fade out across the shoaling zone before the shore. Swell replaces the shore wave bands, which would not be in step with it.

Near land the swell uses the baked shoreline distance. Within `swellShoalPixels` of the coast the
crests bend to run parallel to it; within `surfPixels` they break into Highlight foam and leave
`surfWashPixels` of thinning foam behind. Swell should head towards the coast: a swell heading
away from it does not refract cleanly. `swellShoalPixels` and twice `surfPixels` (the storm surf)
must fit the map importer's shoreline distance range.

A map can override the direction with the Vulcanus location property `swellDirection`
(`default`, or a compass direction: `north`, `northeast`, ... `northwest`); it applies to every
water body on the map. Weather drives the sea: `WeatherData.waterSeaState` (0 calm, 1 storm) sets
`WaterInteraction.SeaState`, which makes crests more continuous and one pixel thicker above 0.5,
caps a share of them with whitecaps, and doubles the surf zone at full strength.

## Banks

A drawn body's `bankProfile` names a `BankProfile` asset in `Assets/Content/Water/Banks/`. A missing
profile, an invalid one, or a texture without Read/Write enabled fails the import. Banks are baked at
import into alpha sprites, one per map cell, on a `Bank_<id>` tilemap that sorts one step above its
water layer. They are static ground decoration, lit like any tile. Every land pixel (inside the map, not
water of any kind) belongs to its nearest drawn body; a body with no bank still keeps other banks off
its own shore.

A profile is a list of layers from the water outwards. Each land pixel takes the first layer that claims it.
- **Band:** a distance range (`startPixels` to `endPixels`, 0 is the first land pixel) filled with a colour
  or a tileable texture sampled in world pixels. Edges wander by `edgeNoisePixels` at `edgeNoiseScale`
  (a broad swing plus finer roughness), never inside the water's edge.
- **Strip:** art laid along the shoreline. The texture's top row lies against the water and its columns
  follow the shore with the water on the left; it covers as many pixels as it is tall. The importer traces
  the outline of the water (islands included) and measures along it; a closed shoreline is stretched
  slightly to hold a whole number of repeats so the art meets itself, and one running off the map edge is
  left at its true length. Transparent pixels fall through to the next layer.
- **Coverage:** `coverageStart` to `coverageEnd` thins a layer across its range. By default pixels are
  dithered in and out with an ordered pattern, so every pixel keeps its palette colour. With
  `fadeWithTransparency` the coverage fades alpha instead (blended, not palette, colours), and
  `ditherStrength` lets the same ordered pattern nudge each pixel's opacity on land for a little pixel
  texture where the bank thins out. The creep into the water is always a smooth fade.
- **Shallows:** `shallowPixels` creeps the bank over the water's edge as `shallowColor`, at
  `shallowCoverage` against the shore, thinning to nothing, so the step from foam to bank is soft.

Layers reach at most 64 pixels from the water.

## Drawn currents

A body's `flow` strokes are freehand lines in map pixels (top-left origin, y down) with a
`width` (the radius within which the stroke steers the water) and a relative `speed`. The
first point is where water enters and the last is where it leaves. They only take effect
when the body's profile has `flowEnabled`; a profile that also has its own `flowMap` fails
the import. A body with no strokes keeps the profile's uniform current.

The importer solves a potential through the body's water, from the strokes' starts to their
ends, with banks as walls, so currents run parallel to banks through bends and side bays
stay nearly still. Near a stroke the current is pulled towards the stroke's own direction,
fully on the line and not at all at its reach. A stroke that starts or ends within another
stroke's reach joins it (a tributary) and is not itself a source or sink. It is solved on
4-pixel cells, so land features thinner than that do not separate channels. Speed ramps
from 40% at the bank to full over 8 pixels. Strokes faster than 1 scale the whole body:
`WaterFlowData.SpeedScale` is the fastest stroke, the map's blue channel is a fraction of
it, and `WaterBody` multiplies the profile's flow speed by it.

The result is a per-body `WaterFlowData` subasset in body-local pixels that replaces the
profile's flow map for that body only. Import fails when a stroke starts or ends on land,
when every stroke end lies on another stroke, or when the starts are not connected through
water to the ends.

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
- **Drawn currents:** see "Drawn currents" above. A body's strokes generate its own flow map.
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
