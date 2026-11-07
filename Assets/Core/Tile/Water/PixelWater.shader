
Shader "UrdewValley/Pixel Water"
{
    Properties
    {
        [PerRendererData] _MainTex ("Sprite Mask", 2D) = "white" {}
        [HideInInspector] _NormalMap ("Normal Map", 2D) = "bump" {}
        _DeepColor ("Deep", Color) = (0.149,0.267,0.322,1)
        _BaseColor ("Base", Color) = (0.173,0.302,0.349,1)
        _WaveColor ("Wave", Color) = (0.212,0.353,0.400,1)
        _HighlightColor ("Highlight", Color) = (0.282,0.424,0.455,1)
        _PixelsPerUnit ("Pixels Per Unit", Float) = 16
        _AnimationFps ("Animation Frames Per Second", Float) = 12
        _WaveSpeed ("Wave Speed", Float) = 0.16
        _WaveScale ("Wave Scale", Float) = 1.5
        _CausticIntensity ("Caustic Intensity", Float) = 0.1
        _CausticScale ("Caustic Scale", Float) = 2
        _FlowDirection ("Flow Direction", Vector) = (1,0.25,0,0)
        [HideInInspector] _ShorelineDistances ("Shoreline Distances", 2DArray) = "" {}
        [HideInInspector] _ShorelinePages ("Shoreline Pages", 2D) = "black" {}
        [HideInInspector] _ShorelineLayout ("Shoreline Layout", Vector) = (0,0,1,1)
        [HideInInspector] _ShorelineRange ("Shoreline Range", Vector) = (128,32,0,0)
        _ShorelineEffects ("Shoreline, Foam, Waves, Shallows", Vector) = (0,1,1,0)
        _Foam ("Foam Width, Coverage, Speed", Vector) = (1.5,0.3,0.4,0)
        _ShoreWaves ("Shore Wave Frequency, Width, Speed, Shallow Width", Vector) = (0.0833333,1,1.5,3)
        _Depth ("Depth Enabled, Start Pixels, Blend Pixels", Vector) = (0,6,4,0)
        _DepthShape ("Depth Steps, Wobble Pixels, Wobble Scale", Vector) = (2,2,12,0)
        _DepthMotion ("Depth Motion Pixels, Period", Vector) = (0.75,5,0,0)
        _StillWater ("Still Water Enabled, Reserved, Reserved, Wind Patch Strength", Vector) = (0,1.5,6,0.6)
        _WindPatches ("Wind Patch Scale, Speed, Direction XY", Vector) = (48,4,1,0)
        _Current ("Current Enabled, Speed, Strength", Vector) = (0,0.3,1,0)
        [HideInInspector] _FlowMap ("Optional Flow Map", 2D) = "black" {}
        [HideInInspector] _FlowMapEnabled ("Flow Map Enabled", Float) = 0
        [HideInInspector] _FlowMapWorldRect ("Flow Map World Origin and Size", Vector) = (0,0,16,16)
        _SurfaceHighlights ("Surface Highlights Enabled, Visible Fraction, Density, Speed", Vector) = (0,0.25,0.2,0.15)
        _SurfaceHighlightShape ("Surface Highlight Scale, Stretch X, Stretch Y", Vector) = (1,4,1,0)
        _ObjectReflections ("Object Reflections Enabled, Opacity, Ripple Pixels, Speed", Vector) = (0,0.35,1,0.5)
        _Interaction ("Ripples, Rain Splashes, Contact Foam", Vector) = (0,0,0,0)
        _Swell ("Swell Enabled, Wavelength Pixels, Speed Pixels, Crest Pixels", Vector) = (0,28,6,1)
        _SwellShape ("Swell Direction XY, Breakup, Cross Train", Vector) = (0,1,0.45,0.35)
        _Surf ("Shoal Pixels, Surf Pixels, Wash Pixels, Meander", Vector) = (20,6,4,0.5)
        _SmoothFades ("Smooth Fades", Float) = 0
        _SwellLook ("Swell Ripple, Shading, Stretch Pixels", Vector) = (0.5,0.35,16,0)
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" "RenderPipeline"="UniversalPipeline" "CanUseSpriteAtlas"="True" }
        Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha
        Cull Off
        ZWrite Off

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/Core2D.hlsl"
        CBUFFER_START(UnityPerMaterial)
            half4 _DeepColor, _BaseColor, _WaveColor, _HighlightColor;
            float _PixelsPerUnit, _AnimationFps, _WaveSpeed, _WaveScale, _CausticIntensity, _CausticScale;
            float4 _FlowDirection;
            float4 _ShorelineLayout, _ShorelineRange, _ShorelineEffects, _Foam, _ShoreWaves, _Depth, _DepthShape, _DepthMotion, _StillWater, _WindPatches;
            float4 _Current, _SurfaceHighlights, _SurfaceHighlightShape;
            float _FlowMapEnabled;
            float4 _FlowMapWorldRect;
            float4 _ObjectReflections;
            float4 _Interaction;
            float4 _Swell, _SwellShape, _Surf, _SwellLook;
            float _SmoothFades;
            float4x4 _WaterWorldToLocal;
        CBUFFER_END
        ENDHLSL

        Pass
        {
            Tags { "LightMode"="Universal2D" }
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma target 3.5
            #include_with_pragmas "Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/ShapeLightShared.hlsl"
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/CombinedShapeLightShared.hlsl"
            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);
            TEXTURE2D_ARRAY(_ShorelineDistances);
            SAMPLER(sampler_ShorelineDistances);
            TEXTURE2D(_ShorelinePages);
            SAMPLER(sampler_ShorelinePages);
            TEXTURE2D(_FlowMap);
            SAMPLER(sampler_FlowMap);
            TEXTURE2D(_WaterObjectReflectionTexture);
            SAMPLER(sampler_WaterObjectReflectionTexture);
            float4x4 _WaterObjectReflectionWorldToClip;
            float _WaterObjectReflectionAvailable;

            // Globals from WaterInteraction.cs. Sizes must match its MaxRipples/MaxContacts.
            #define WATER_MAX_RIPPLES 16
            #define WATER_MAX_CONTACTS 32
            float4 _WaterRipples[WATER_MAX_RIPPLES];   // world xy, start time, max radius pixels (0 = unused)
            float4 _WaterContacts[WATER_MAX_CONTACTS]; // world xy, foam radius pixels xy
            float _WaterContactCount, _WaterInteractionClock, _WaterRain;
            float _WaterSeaState; // From the weather: 0 calm to 1 storm.

            struct Attributes { COMMON_2D_INPUTS half4 color : COLOR; };
            struct Varyings
            {
                COMMON_2D_OUTPUTS_SHARED
                float3 world : TEXCOORD1;
                half2 lightingUV : TEXCOORD2;
                half4 color : COLOR;
            };
            Varyings Vert(Attributes input)
            {
                Varyings output = (Varyings)0;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
                SetUpSpriteInstanceProperties();
                input.positionOS = UnityFlipSprite(input.positionOS, unity_SpriteProps.xy);
                float3 world = TransformObjectToWorld(input.positionOS);
                output.positionCS = TransformWorldToHClip(world);
                output.world = world;
                output.uv = input.uv;
                output.lightingUV = half2(ComputeScreenPos(output.positionCS / output.positionCS.w).xy);
                output.color = input.color * unity_SpriteColor;
                return output;
            }

            // ---- Pixel grid helpers ---------------------------------------------------------
            // Most patterns use the 16-PPU world grid. Sparse caustic glints alone use a fixed
            // 2x detail grid; never mix the grids within one effect. Pattern maths runs on
            // unsigned grid coordinates: world pixels plus a large bias, so they are never negative.
            // Unsigned division and modulo are cheaper than signed ones and need no floor fix-ups.
            // The bias is a multiple of every power-of-two cell size, so those grids stay aligned.

            static const uint GridBias = 0x20000000u;

            uint Pcg(uint v)
            {
                uint state = v * 747796405u + 2891336453u;
                uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
                return (word >> 22u) ^ word;
            }

            // Stable integer hash: no sin() precision loss at large world coordinates.
            float Rand(uint2 cell, uint salt)
            {
                uint h = Pcg(Pcg(cell.x ^ (salt * 0x9E3779B9u)) + cell.y);
                return float(h) * (1.0 / 4294967296.0);
            }

            // Whole animation frames. Wraps every 65536 ticks.
            uint Tick() { return uint(floor(_Time.y * _AnimationFps)) & 0xFFFFu; }

            int2 WorldPixel(float2 world) { return int2(floor(world * _PixelsPerUnit)); }
            int2 DetailPixel(float2 world) { return int2(floor(world * (_PixelsPerUnit * 2.0))); }
            uint2 Grid(int2 px) { return uint2(px) + GridBias; } // Wraps correctly for negative pixels.

            // Surface patterns are drawn as dashes along +x. Flowing water turns that frame so the dashes run
            // along the current. Only the eight compass headings are used: a quarter turn swaps and flips
            // whole pixels, and an eighth turn uses a 45-degree lattice, so every dash stays one crisp pixel
            // thick instead of smearing into an aliased band at an arbitrary angle.
            static const int2 FlowSteps[8] =
                { int2(1, 0), int2(1, 1), int2(0, 1), int2(-1, 1), int2(-1, 0), int2(-1, -1), int2(0, -1), int2(1, -1) };

            // The compass heading closest to a velocity, as a step of -1, 0 or 1 per axis. Still water faces east.
            int2 FlowStep(float2 velocity)
            {
                if (dot(velocity, velocity) < 1e-6) return FlowSteps[0];
                return FlowSteps[uint(round(atan2(velocity.y, velocity.x) / 0.785398163 + 8.0)) & 7u];
            }

            // Pattern space for a current heading along `step`: x runs along the current, y across it.
            int2 FlowFrame(int2 pixel, int2 step) { return int2(dot(pixel, step), step.x * pixel.y - step.y * pixel.x); }

            // Squashed ellipses read as circles on a top-down water plane.
            bool InsideEllipse(int2 d, float2 radius)
            {
                float2 q = float2(d) / (radius + 0.5);
                return dot(q, q) <= 1;
            }

            // One-pixel, always-connected outline of a filled ellipse.
            bool EllipseEdge(int2 d, float2 radius)
            {
                return InsideEllipse(d, radius) &&
                    (!InsideEllipse(d + int2(1, 0), radius) || !InsideEllipse(d - int2(1, 0), radius) ||
                     !InsideEllipse(d + int2(0, 1), radius) || !InsideEllipse(d - int2(0, 1), radius));
            }

            // ---- Shoreline distance ---------------------------------------------------------
            float ShoreDistance(int2 bodyPixel)
            {
                int2 pixel = bodyPixel - int2(_ShorelineLayout.xy);
                if (any(pixel < 0)) return _ShorelineRange.y;
                uint chunk = uint(_ShorelineRange.x);
                uint2 local = uint2(pixel);
                uint2 page = local / chunk;
                if (any(page >= uint2(_ShorelineLayout.zw))) return _ShorelineRange.y;
                float slice = SAMPLE_TEXTURE2D_LOD(_ShorelinePages, sampler_ShorelinePages,
                    (page + 0.5) / _ShorelineLayout.zw, 0).r - 1;
                if (slice < 0) return _ShorelineRange.y; // Sparse page without water geometry.
                float2 uv = (local % chunk + 0.5) / chunk;
                return SAMPLE_TEXTURE2D_ARRAY_LOD(_ShorelineDistances, sampler_ShorelineDistances, uv, slice, 0).r;
            }

            // ---- Depth ----------------------------------------------------------------------
            static const uint BayerMatrix[16] = { 0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5 };

            // Smooth value noise on a coarse world-pixel lattice, in [0,1]. Static, so contours never crawl.
            float ValueNoise(int2 px, float scale)
            {
                float2 p = px / max(scale, 1);
                int2 i = int2(floor(p));
                float2 f = p - i;
                f = f * f * (3 - 2 * f);
                float a = Rand(Grid(i), 50u), b = Rand(Grid(i + int2(1, 0)), 50u);
                float c = Rand(Grid(i + int2(0, 1)), 50u), d = Rand(Grid(i + int2(1, 1)), 50u);
                return lerp(lerp(a, b, f.x), lerp(c, d, f.x), f.y);
            }

            // How deep a pixel looks, from 0 (Base) to 1 (Deep).
            // Steps > 0: hard bands with that many in-between shades. Band edges wander by a
            // slow noise, so they read as depth contours rather than a copy of the shoreline.
            // Steps 0: the original ordered dither between Base and Deep.
            float DepthLevel(float distance, int2 px, uint2 g, float seconds)
            {
                if (_Depth.x <= 0) return 0;
                if (_DepthShape.y > 0) distance += (ValueNoise(px, _DepthShape.z) * 2 - 1) * _DepthShape.y;
                // Slow breathing of the band edges. Each region has its own phase, so contours
                // shift locally by whole pixels instead of the whole pond pulsing at once.
                if (_DepthMotion.x > 0)
                {
                    float phase = ValueNoise(px + int2(57, 91), _DepthShape.z * 1.5) * 6.2832;
                    distance += sin(6.2832 * seconds / max(_DepthMotion.y, 0.5) + phase) * _DepthMotion.x;
                }
                if (_Depth.z <= 0) return distance >= _Depth.y ? 1 : 0;
                float t = saturate((distance - _Depth.y) / _Depth.z);
                if (_SmoothFades > 0) return t; // Smooth fades: a continuous gradient instead of bands.
                uint steps = uint(round(_DepthShape.x));
                if (steps == 0u)
                {
                    float threshold = (BayerMatrix[(g.x & 3u) + (g.y & 3u) * 4u] + 0.5) / 16;
                    return t > threshold ? 1 : 0;
                }
                float bands = steps + 1;
                return min(floor(t * (bands + 1)), bands) / bands;
            }

            // ---- Surface patterns -----------------------------------------------------------
            // Flowing water drifts in one direction. Still ponds keep their grids fixed:
            // wavelets and glints animate in place rather than moving the entire pattern at once.
            // Wind patches can still modulate which wavelets appear.

            bool StillWater() { return _StillWater.x > 0; }

            // 0 outside wind patches, up to 1 inside. Large, soft noise drifting with the wind.
            float WindPatch(int2 px, float seconds)
            {
                if (_StillWater.w <= 0) return 0;
                int2 offset = int2(round(_WindPatches.zw * _WindPatches.y * seconds));
                return smoothstep(0.45, 0.75, ValueNoise(px - offset, _WindPatches.x));
            }

            // The effect is absent at the beginning/end, grows over the first quarter,
            // holds its shape, then shrinks over the final quarter. The result changes
            // *pixel coverage*, not alpha, so all visible pixels keep the four-colour palette.
            float LifeEnvelope(float life)
            {
                return smoothstep(0.0, 0.25, life) *
                    (1.0 - smoothstep(0.75, 1.0, life));
            }

            // Wavelets: horizontal dashes grow from a point, hold, then shrink away.
            // Each cycle picks a new length and position. Some add a shorter parallel dash below.
            half3 Ripples(uint2 g, uint tick, half3 color, float2 driftDirection)
            {
                uint2 cellSize = uint2(max(int2(round(float2(16, 8) / _WaveScale)), int2(8, 4)));
                float seconds = tick / _AnimationFps;
                int2 drift = StillWater() ? int2(0, 0)
                    : int2(round(driftDirection * (_WaveSpeed * seconds) * _PixelsPerUnit));
                uint2 p = g - uint2(drift);
                uint row = p.y / cellSize.y;
                uint stagger = uint(Rand(uint2(row, 0), 1u) * cellSize.x); // Stagger rows like brickwork.
                uint x = p.x + stagger;
                uint2 cell = uint2(x / cellSize.x, row);
                uint2 local = uint2(x % cellSize.x, p.y % cellSize.y);
                // An independent clock for each cell, with a shorter lifecycle on still water.
                float phase = seconds * _WaveSpeed * (StillWater() ? 0.65 : 0.127) + Rand(cell, 2u);
                float cycle = frac(phase);
                if (cycle >= 0.56) return color;
                uint2 variant = cell + uint(phase) * uint2(7u, 13u); // New wavelet every cycle.

                float chance = 0.6;
                if (StillWater())
                {
                    // Wind patches are sampled at the cell centre, so a wavelet is never cut in half.
                    uint2 centre = uint2(cell.x * cellSize.x - stagger, row * cellSize.y) + cellSize / 2u + uint2(drift);
                    float patch = WindPatch(int2(centre - GridBias), seconds);
                    chance = saturate(0.6 * lerp(1 - 0.7 * _StillWater.w, 1 + 0.6 * _StillWater.w, patch));
                }
                if (Rand(variant, 3u) >= chance) return color;

                uint stage = min(uint(cycle / 0.56 * 7), 6u);
                if (stage == 0u || stage == 6u) return color;
                uint longest = cellSize.x - 2u;
                uint length = min(3u + uint(Rand(variant, 4u) * (longest - 2u)), longest);
                uint shown = stage == 3u ? length :
                    (stage == 2u || stage == 4u ? max(length / 2u, 2u) : 1u);
                uint centreX = 1u + uint(Rand(variant, 5u) * (cellSize.x - 1u - length)) + length / 2u;
                uint start = centreX - shown / 2u;
                uint crest = 1u + uint(Rand(variant, 6u) * (cellSize.y - 2u));
                if (local.y == crest && local.x >= start && local.x < start + shown) return _WaveColor.rgb;
                bool doubled = stage == 3u && shown >= 5u && Rand(variant, 7u) < 0.35;
                if (doubled && local.y + 1u == crest && local.x >= start + 2u && local.x < start + shown - 1u)
                    return _WaveColor.rgb;
                return color;
            }

            // Sparse 32-PPU glints. Shapes are always one *detail-grid* pixel tall,
            // and grow by pairs of detail pixels. This is the only intentionally finer layer.
            half3 Caustics(uint2 detailG, uint tick, half3 color)
            {
                if (_CausticIntensity <= 0) return color;
                uint size = uint(max(round(32 / _CausticScale), 8));
                float seconds = tick / _AnimationFps;
                int2 drift = StillWater() ? int2(0, 0)
                    : int2(round(float2(0.3, -0.2) * _WaveSpeed * seconds * _PixelsPerUnit * 2.0));
                uint2 p = detailG - uint2(drift);
                uint2 cell = p / size;
                uint2 local = p % size;
                if (Rand(cell, 3u) > _CausticIntensity) return color; // Fraction of cells with a glint.
                float cycle = frac(seconds * _WaveSpeed * 0.9 + Rand(cell, 4u));
                if (cycle >= 0.5) return color;
                float life = cycle * 2.0;
                uint length = uint(round(3.0 * LifeEnvelope(life))) * 2u;
                if (length == 0u) return color;
                uint2 at = uint2(2u + uint(Rand(cell, 5u) * (size - 8u)), 2u + uint(Rand(cell, 6u) * (size - 4u)));
                uint start = at.x + (6u - length) / 2u;
                if (local.y == at.y && local.x >= start && local.x < start + length)
                    return length == 6u ? _HighlightColor.rgb : _WaveColor.rgb;
                return color;
            }

            // Stretched one-pixel streaks: grow/hold/shrink about a stable centre.
            // Use palette steps at the peak instead of fading pixels through off-palette colours.
            half3 Highlights(uint2 g, uint tick, half3 color)
            {
                if (!(_SurfaceHighlights.x > 0 && _SurfaceHighlights.y > 0 && _SurfaceHighlights.z > 0)) return color;
                uint2 size = uint2(max(int2(round(_SurfaceHighlightShape.yz / _SurfaceHighlightShape.x * _PixelsPerUnit)), int2(8, 3)));
                float seconds = tick / _AnimationFps;
                int2 drift = StillWater() ? int2(0, 0)
                    : int2(round(_SurfaceHighlights.w * seconds * _PixelsPerUnit), 0);
                uint2 p = g - uint2(drift);
                uint2 cell = p / size;
                uint2 local = p % size;
                if (Rand(cell, 7u) >= _SurfaceHighlights.z) return color;
                float cycle = frac(seconds * _SurfaceHighlights.w * 0.5 + Rand(cell, 8u));
                if (cycle >= _SurfaceHighlights.y) return color;
                float life = cycle / max(_SurfaceHighlights.y, 0.0001);
                uint fullLength = size.x / 4u + uint(Rand(cell, 9u) * (size.x / 2u));
                uint shown = uint(round(fullLength * LifeEnvelope(life)));
                if (shown == 0u) return color;
                uint fullStart = uint(Rand(cell, 10u) * (size.x - fullLength));
                uint start = fullStart + (fullLength - shown) / 2u;
                uint row = 1u + uint(Rand(cell, 11u) * (size.y - 2u));
                if (local.x < start || local.x >= start + shown) return color;
                uint x = local.x - fullStart; // Keep the step anchored as the streak changes length.
                if (local.y == row + (x * 2u >= fullLength ? 1u : 0u))
                    return life >= 0.30 && life <= 0.70 ? _HighlightColor.rgb : _WaveColor.rgb;
                return color;
            }

            // `driftDirection` is the base ripple drift in pattern space: the profile's flow direction on its
            // own, or straight along the current once the pattern frame has been turned to face it.
            half3 SurfaceColor(uint2 g, uint2 detailG, uint tick, half3 water, float2 driftDirection)
            {
                half3 color = water;
                color = Ripples(g, tick, color, driftDirection);
                color = Caustics(detailG, tick, color);
                color = Highlights(g, tick, color);
                return color;
            }

            // Flowing water softens the pattern across the current (1-2-1 over three pixel rows in the flow frame),
            // so one-pixel streaks become soft bands instead of hard hairlines. Intermediate shades are intended.
            half3 FlowSurfaceColor(uint2 g, uint2 detailG, uint tick, half3 water, float2 driftDirection)
            {
                half3 above = SurfaceColor(g - uint2(0, 1), detailG - uint2(0, 2), tick, water, driftDirection);
                half3 centre = SurfaceColor(g, detailG, tick, water, driftDirection);
                half3 below = SurfaceColor(g + uint2(0, 1), detailG + uint2(0, 2), tick, water, driftDirection);
                return above * 0.25 + centre * 0.5 + below * 0.25;
            }

            // ---- Swell ----------------------------------------------------------------------
            // Open-water waves. Crests run across the travel direction a wavelength apart and advance in whole
            // pixels. Within the shoaling distance of land the phase turns to follow the coastline, so crests
            // bend parallel to the beach; within the surf distance they break into foam and leave wash behind.
            // The weather's sea state makes crests more continuous and thicker, adds whitecaps and widens the
            // surf. Every pixel stays a palette colour: crest Wave, the trough behind it Deep, foam Highlight.

            // Wave phase in wavelengths; whole numbers are crests.
            float SwellPhase(float2 pixel, float distance, float2 direction, float wavelength, float travelled)
            {
                float open = dot(pixel, direction) / wavelength;
                float coast = -distance / wavelength;
                float shoal = 1 - saturate(distance / max(_Surf.x, 1));
                shoal = shoal * shoal * (3 - 2 * shoal);
                return lerp(open, coast, shoal) - travelled / wavelength;
            }

            // How strongly a pixel shows the crest, the trough behind it and foam, each 0 to 1. Hard shading uses
            // whole weights, so every pixel is one palette colour. Smooth fades let the weights taper, so crests
            // become soft bands that fade at their edges and stretch ends, and foam washes out.
            // The fourth weight is the swell's broad shading, -1 (trough) to 1 (crest), already scaled.
            float4 SwellTrain(int2 px, float distance, float2 direction, float wavelength, float travelled,
                float crestPixels, float breakup, uint seed, float seconds)
            {
                int along = int(round(dot(float2(px), float2(-direction.y, direction.x))));
                float phase = SwellPhase(float2(px) + 0.5, distance, direction, wavelength, travelled);
                // Crests meander sideways along their length, so they curve instead of running ruler-straight.
                // The noise is fixed to the crest's place along the sea, so a crest keeps its shape as it travels.
                phase += (ValueNoise(int2(along, int(seed) * 31), max(wavelength * 1.5, 8)) * 2 - 1) * 0.5 * _Surf.w;
                // Ripple: crests also undulate slowly over time, so they are not stiff as they travel.
                phase += (ValueNoise(int2(along + 977, int(seed) * 57 + int(seconds * 6)), max(wavelength * 0.8, 6)) * 2 - 1) * 0.25 * _SwellLook.x;
                float f = frac(phase);
                int wave = int(floor(phase));
                float sea = _WaterSeaState;
                bool breaking = distance < _Surf.y * (1 + sea);
                // Each crest has its own breaks, from noise along it.
                float gaps = breakup * (1 - 0.6 * sea) * (breaking ? 0.4 : 1);
                // Smooth fades: crests and their shading fade out across the shoaling zone, gone before the shore.
                float shoreFade = _SmoothFades > 0 ? saturate((distance - _Surf.y * 0.5) / max(_Surf.x - _Surf.y * 0.5, 1)) : 1;
                // Smooth fades: the whole sea rolls gently lighter towards each crest and darker in between.
                float shade = _SmoothFades > 0 ? cos(6.2832 * f) * _SwellLook.y * shoreFade : 0;
                // Each crest slowly fades in, peaks and fades out again while it travels. Every crest has its own
                // offset, so neighbours are at different stages. A full cycle takes this many wavelengths of travel.
                const float lifeWavelengths = 6;
                float life = frac(travelled / wavelength / lifeWavelengths + Rand(uint2(uint(wave + 65536), 0u), 50u + seed));
                float lifeFade = sin(3.14159 * life);
                float body = ValueNoise(int2(along, wave * 97 + int(seed)), max(_SwellLook.z, 4));
                if (body < gaps || (_SmoothFades <= 0 && lifeFade < 0.2)) return float4(0, 0, 0, shade);
                // A crest stretch is thickest in its middle and thins out towards its ends.
                float swell = gaps > 0 ? saturate((body - gaps) / 0.3) : 1;
                float thickness = crestPixels * lerp(0.6, 1.4, swell) * (_SmoothFades > 0 ? 1 : lerp(0.5, 1, lifeFade));
                float ahead = f * wavelength;        // Pixels in front of the crest line.
                float behind = (1 - f) * wavelength; // Pixels behind it.
                // Ocean foam: a share of crest stretches are foam even in calm seas, more in rough seas.
                // Only the crest itself, no trailing flecks: those are fixed to the screen, not the crest, and read as dirt.
                bool whitecap = Rand(uint2(uint(along + 65536) / 3u, uint(wave + 65536)), 40u + seed) < 0.12 + sea * 0.4;
                float wash = _Surf.z;

                float crest, trough, foam;
                if (_SmoothFades > 0)
                {
                    crest = saturate(1 - ahead / (thickness + 1.5)) * lerp(0.35, 1, swell) * shoreFade * lifeFade;
                    trough = saturate(1 - behind / 2.5) * 0.45 * swell * shoreFade * lifeFade;
                    foam = breaking && wash > 0 ? saturate(1 - behind / wash) * 0.7 * shoreFade * lifeFade : 0;
                }
                else
                {
                    crest = ahead < thickness ? 1 : 0;
                    trough = crest == 0 && behind < 1 ? 1 : 0; // One pixel of trough behind the crest.
                    // Wash thins out away from the crest.
                    foam = breaking && wash > 0 && crest == 0 && behind < wash && Rand(Grid(px), 41u + seed) < 1 - behind / wash ? 1 : 0;
                    if (foam > 0) trough = 0;
                }
                // A breaking crest, or a whitecap, is foam rather than a crest.
                if (breaking || whitecap)
                {
                    foam = max(foam, crest * (breaking ? 1 : 0.8));
                    crest = 0;
                }
                return float4(crest, trough, foam, shade);
            }

            half3 Swell(int2 px, float distance, uint tick, half3 color)
            {
                if (_Swell.x <= 0 || _Swell.y <= 0) return color;
                float seconds = tick / _AnimationFps;
                float2 direction = normalize(_SwellShape.xy);
                float crestPixels = _Swell.w + (_WaterSeaState > 0.5 ? 1 : 0);
                float4 weights = SwellTrain(px, distance, direction, _Swell.y, round(_Swell.z * seconds), crestPixels, _SwellShape.z, 0u, seconds);
                if (_SwellShape.w > 0)
                {
                    // A weaker, shorter train at 35 degrees breaks up the regularity of a single swell.
                    float2 cross = float2(direction.x * 0.819 - direction.y * 0.574, direction.x * 0.574 + direction.y * 0.819);
                    float4 second = SwellTrain(px, distance, cross, _Swell.y * 0.62, round(_Swell.z * 0.8 * seconds), _Swell.w,
                        1 - _SwellShape.w * (1 - _SwellShape.z), 7u, seconds);
                    if (max(weights.x, max(weights.y, weights.z)) < 1)
                    {
                        weights.x = max(weights.x, second.x); // The weaker train casts no trough.
                        weights.z = max(weights.z, second.z);
                    }
                    // Shading from both trains crossing reads as chop instead of parallel stripes.
                    weights.w = weights.w * 0.6 + second.w * 0.4;
                }
                // Patches of calmer and livelier water, fixed in place while the waves pass through them.
                weights.w *= lerp(0.2, 1, ValueNoise(px, max(_Swell.y * 3, 24)));
                // Broad shading first, so crests and troughs sit on a rolling surface.
                color = weights.w > 0 ? lerp(color, _WaveColor.rgb, weights.w * 0.5) : lerp(color, _DeepColor.rgb, -weights.w * 0.6);
                color = lerp(color, _DeepColor.rgb, weights.y);
                color = lerp(color, _WaveColor.rgb, weights.x);
                return lerp(color, _HighlightColor.rgb, weights.z);
            }

            // ---- Shoreline ------------------------------------------------------------------
            // Hard shading paints the target palette colour; smooth fades blend towards it by `strength`.
            half3 ShoreBlend(half3 color, half3 target, float strength)
            {
                return _SmoothFades > 0 ? lerp(color, target, saturate(strength)) : target;
            }

            half3 Shoreline(float distance, uint2 g, uint tick, half3 color)
            {
                if (distance >= _ShorelineRange.y) return color;
                float seconds = tick / _AnimationFps;
                uint ring = uint(distance); // Each pixel belongs to exactly one integer ring.

                if (_ShorelineEffects.w > 0 && distance < _ShoreWaves.w)
                    color = ShoreBlend(color, _WaveColor.rgb, 1 - distance / _ShoreWaves.w);

                if (_ShorelineEffects.z > 0 && _ShoreWaves.x > 0 && _ShoreWaves.y > 0 && _Swell.x <= 0)
                {
                    uint spacing = uint(max(round(1 / _ShoreWaves.x), 2));
                    uint width = uint(clamp(round(_ShoreWaves.y), 1, spacing - 1));
                    uint shifted = ring + uint(round(_ShoreWaves.z * seconds)); // Whole pixels towards land.
                    uint wave = shifted / spacing;                             // Crest this ring is part of.
                    // Fade within half a spacing so ponds do not fill with nested outlines.
                    float coverage = 0.65 * saturate(1 - 2 * distance / spacing);
                    if (shifted % spacing < width && Rand(g / 8u + wave * 131u, 12u) < coverage)
                        color = ShoreBlend(color, _WaveColor.rgb, 0.6);
                }

                // A mostly connected, stationary one-pixel rim remains visible even
                // between foam pulses. Long gaps keep it from reading as a neon outline.
                if (_ShorelineEffects.y > 0 && distance < 1.5 &&
                    Rand(g / uint2(8u, 4u), 31u) < 0.75)
                    color = ShoreBlend(color, _WaveColor.rgb, 0.55);

                if (_ShorelineEffects.y > 0 && distance < _Foam.x && _Foam.y > 0)
                {
                    // Bright 3x1 blocks grow and recede, but remain visible throughout
                    // their active lifetime. Foam no longer disappears for most of a pulse.
                    uint2 block = g / uint2(3u, 1u);
                    float cycle = frac(seconds * _Foam.z * 0.5 + Rand(block, 13u));
                    // Distances measure pixel centres: the first water row is 1 pixel from land.
                    float coverage = distance < 2 ? saturate(_Foam.y * 2) : _Foam.y;
                    if (cycle < coverage)
                    {
                        float life = cycle / max(coverage, 0.0001);
                        uint shown = max(1u, uint(round(3.0 * LifeEnvelope(life))));
                        uint offset = (3u - shown) / 2u;
                        uint localX = g.x % 3u;
                        if (localX >= offset && localX < offset + shown)
                            color = ShoreBlend(color, _HighlightColor.rgb, 1.15 - distance / _Foam.x);
                    }
                }
                return color;
            }

            // ---- Interaction ----------------------------------------------------------------
            // Offsets around a centre are signed, so these effects keep int2 distances.

            // Foam ring around objects standing in water, plus a slow lapping ring outside it.
            half3 ContactFoam(int2 px, uint2 g, uint tick, half3 color)
            {
                if (_Interaction.z <= 0) return color;
                uint count = min(uint(_WaterContactCount), (uint)WATER_MAX_CONTACTS);
                for (uint i = 0; i < count; i++)
                {
                    float4 contact = _WaterContacts[i];
                    int2 center = WorldPixel(contact.xy);
                    int2 d = px - center;
                    float2 radius = contact.zw;
                    if (any(abs(d) > int2(radius) + 3)) continue;
                    uint localTick = tick + uint(Rand(Grid(center), 41u) * 12); // Desync neighbouring objects.
                    if (EllipseEdge(d, radius))
                    {
                        if (Rand(g, 30u + localTick / 4u) < 0.75) color = _HighlightColor.rgb;
                        continue;
                    }
                    uint lap = (localTick / 3u) & 3u; // 0 rest, 1 and 2 lap outwards, 3 rest
                    if (lap > 0u && lap < 3u && EllipseEdge(d, radius + lap) && Rand(g, 40u + localTick / 3u) < 0.5)
                        color = _WaveColor.rgb;
                }
                return color;
            }

            // Expanding rings from steps, splashes, bobbers and other gameplay events.
            half3 InteractionRipples(int2 px, uint2 g, half3 color)
            {
                if (_Interaction.x <= 0) return color;
                for (uint i = 0; i < WATER_MAX_RIPPLES; i++)
                {
                    float4 ripple = _WaterRipples[i];
                    if (ripple.w <= 0) continue;
                    float age = _WaterInteractionClock - ripple.z;
                    if (age < 0) continue;
                    int radius = 1 + int(floor(age * _AnimationFps)); // One pixel per tick.
                    int maxRadius = int(ripple.w);
                    if (radius > maxRadius) continue;
                    int2 d = px - WorldPixel(ripple.xy);
                    if (any(abs(d) > radius + 1)) continue;
                    float life = (float)radius / maxRadius;
                    bool edge = EllipseEdge(d, float2(radius, max(radius * 0.5, 1)));
                    // Large splashes trail a second, inner ring.
                    int inner = radius - 4;
                    bool innerEdge = maxRadius >= 8 && inner >= 1 && EllipseEdge(d, float2(inner, max(inner * 0.5, 1)));
                    if (!edge && !innerEdge) continue;
                    // Rings break up as they fade instead of changing opacity.
                    if (life > 0.5 && Rand(g, 16u + uint(radius)) < (life - 0.5) * 1.6) continue;
                    color = edge && life < 0.34 ? _HighlightColor.rgb : _WaveColor.rgb;
                }
                return color;
            }

            // Three-frame raindrop splashes: dot, pair, small ring. One possible drop per 8x8 cell.
            half3 RainSplashes(uint2 g, uint tick, half3 color)
            {
                if (_Interaction.y <= 0 || _WaterRain <= 0) return color;
                const uint size = 8u;
                const uint period = 12u;
                uint2 cell = g / size;
                uint2 local = g % size;
                uint shifted = tick + uint(Rand(cell, 20u) * period);
                uint cycle = shifted / period;
                uint age = shifted % period;
                if (age > 2u) return color;
                uint2 drop = cell + cycle * uint2(7u, 13u); // New spot and chance every cycle.
                if (Rand(drop, 21u) >= _WaterRain) return color;
                uint2 at = uint2(2u + uint(Rand(drop, 22u) * (size - 4u)), 1u + uint(Rand(drop, 23u) * (size - 2u)));
                int2 d = int2(local) - int2(at);
                if (age == 0u && all(d == 0)) return _HighlightColor.rgb;
                if (age == 1u && d.y == 0 && abs(d.x) == 1) return _HighlightColor.rgb;
                if (age == 2u && EllipseEdge(d, float2(2, 1))) return _WaveColor.rgb;
                return color;
            }

            // ---- Object reflections ---------------------------------------------------------
            half3 ReflectionPalette(half3 source)
            {
                half3 result = _DeepColor.rgb;
                float best = dot(source - result, source - result);
                float candidate = dot(source - _BaseColor.rgb, source - _BaseColor.rgb);
                if (candidate < best) { best = candidate; result = _BaseColor.rgb; }
                candidate = dot(source - _WaveColor.rgb, source - _WaveColor.rgb);
                if (candidate < best) { best = candidate; result = _WaveColor.rgb; }
                candidate = dot(source - _HighlightColor.rgb, source - _HighlightColor.rgb);
                if (candidate < best) result = _HighlightColor.rgb;
                return result;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                // Hard mask edge: no half-blended, off-palette edge pixels from atlas filtering.
                half mask = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, input.uv).a;
                clip(mask - 0.5);
                half alpha = input.color.a; // Source layer opacity only.

                int2 px = WorldPixel(input.world.xy);
                uint2 detailG = Grid(DetailPixel(input.world.xy));
                float2 p = (float2(px) + 0.5) / _PixelsPerUnit; // Centre of one logical world pixel.
                // Tile chunks may be batched with a different object matrix. The bake belongs to
                // the WaterBody transform, including fractional map placement in the scene.
                // Sample the local bake at the *same snapped world-pixel centre* as the surface
                // patterns, preventing two slightly offset pixel grids from splitting a pixel.
                int2 bodyPixel = int2(floor(mul(_WaterWorldToLocal, float4(p, input.world.z, 1)).xy * _PixelsPerUnit));
                uint2 g = Grid(px);
                uint tick = Tick();
                float seconds = tick / _AnimationFps;

                float distance = (_ShorelineEffects.x > 0 || _Depth.x > 0 || _Swell.x > 0) ? ShoreDistance(bodyPixel) : _ShorelineRange.y;
                half3 water = lerp(_BaseColor.rgb, _DeepColor.rgb, DepthLevel(distance, px, g, seconds));

                half3 color;
                if (_Current.x > 0 && _Current.y > 0 && _Current.z > 0 && _FlowMapEnabled > 0)
                {
                    float2 flowUV = (p - _FlowMapWorldRect.xy) / _FlowMapWorldRect.zw;
                    float3 flow = SAMPLE_TEXTURE2D_LOD(_FlowMap, sampler_FlowMap, flowUV, 0).rgb;
                    // Byte 128 is exactly neutral; blue zero makes a stationary current.
                    float2 velocity = clamp((flow.rg * 255 - 128) / 127, -1, 1) * flow.b * _Current.z;
                    // The patterns face along the local current. Diagonal lattice steps are longer than a pixel.
                    int2 step = FlowStep(velocity);
                    float scroll = length(velocity) * length(float2(step)) * _PixelsPerUnit;
                    uint2 frameG = Grid(FlowFrame(px, step));
                    uint2 frameDetail = Grid(FlowFrame(DetailPixel(input.world.xy), step));
                    float2 drift = float2(length(_FlowDirection.xy), 0);
                    // Two overlapping two-unit scrolls along the current, in whole pixels, dithered per pixel.
                    float phase = frac(seconds * _Current.y * 0.5);
                    int firstOffset = int(round(scroll * (phase * 2)));
                    int secondOffset = int(round(scroll * (frac(phase + 0.5) * 2)));
                    half3 first = FlowSurfaceColor(frameG - uint2(firstOffset, 0), frameDetail - uint2(firstOffset * 2, 0), tick, water, drift);
                    half3 second = FlowSurfaceColor(frameG - uint2(secondOffset, 0), frameDetail - uint2(secondOffset * 2, 0), tick, water, drift);
                    float weight = 1 - abs(phase * 2 - 1);
                    color = Rand(g, 14u) < weight ? first : second;
                }
                else
                {
                    uint2 surface = g;
                    uint2 detailSurface = detailG;
                    float2 drift = _FlowDirection.xy;
                    if (_Current.x > 0)
                    {
                        // A uniform current also turns the patterns to face along it.
                        int2 step = FlowStep(_FlowDirection.xy);
                        float scroll = length(_FlowDirection.xy) * length(float2(step)) * (_Current.y * _Current.z * seconds) * _PixelsPerUnit;
                        int offset = int(round(scroll));
                        surface = Grid(FlowFrame(px, step)) - uint2(offset, 0);
                        detailSurface = Grid(FlowFrame(DetailPixel(input.world.xy), step)) - uint2(offset * 2, 0);
                        drift = float2(length(_FlowDirection.xy), 0);
                    }
                    color = _Current.x > 0 ? FlowSurfaceColor(surface, detailSurface, tick, water, drift)
                                           : SurfaceColor(surface, detailSurface, tick, water, drift);
                }

                if (_ObjectReflections.x > 0 && _ObjectReflections.y > 0 && _WaterObjectReflectionAvailable > 0)
                {
                    float2 reflectedPoint = p;
                    reflectedPoint.x += round(sin(p.y * 8 + seconds * _ObjectReflections.w) * _ObjectReflections.z) / _PixelsPerUnit;
                    float4 reflectedClip = mul(_WaterObjectReflectionWorldToClip, float4(reflectedPoint, input.world.z, 1));
                    float2 reflectionUV = reflectedClip.xy / reflectedClip.w * 0.5 + 0.5;
                    if (all(reflectionUV >= 0) && all(reflectionUV <= 1))
                    {
                        half4 reflected = SAMPLE_TEXTURE2D(_WaterObjectReflectionTexture, sampler_WaterObjectReflectionTexture, reflectionUV);
                        if (reflected.a > 0 && Rand(g, 15u) < reflected.a * _ObjectReflections.y)
                            color = ReflectionPalette(reflected.rgb / reflected.a);
                    }
                }

                if (_ShorelineEffects.x > 0)
                    color = Shoreline(distance, g, tick, color);

                // Swell after the shoreline, so breaking crests and wash show over the shallows and foam rim.
                color = Swell(px, distance, tick, color);

                // Interaction draws last so it reads on top of reflections and shore effects.
                color = ContactFoam(px, g, tick, color);
                color = InteractionRipples(px, g, color);
                color = RainSplashes(g, tick, color);

                // Same 2D light composition as Sprite-Lit-Default: daylight, local lights and
                // renderer tint modulate every palette entry.
                SurfaceData2D surfaceData;
                InputData2D inputData;
                InitializeSurfaceData(color * input.color.rgb, alpha, half4(1,1,1,1), half3(0,0,1), surfaceData);
                InitializeInputData(input.uv, input.lightingUV, inputData);
                return CombinedShapeLightShared(surfaceData, inputData);
            }
            ENDHLSL
        }

        Pass
        {
            Tags { "LightMode"="NormalsRendering" }
            HLSLPROGRAM
            #pragma vertex NormalsVertex
            #pragma fragment NormalsFragment
            #pragma multi_compile_instancing
            struct Attributes { COMMON_2D_NORMALS_INPUTS half4 color : COLOR; };
            struct Varyings { COMMON_2D_NORMALS_OUTPUTS half4 color : COLOR; };
            #include "Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/Normals2DCommon.hlsl"

            Varyings NormalsVertex(Attributes input)
            {
                SetUpSpriteInstanceProperties();
                input.positionOS = UnityFlipSprite(input.positionOS, unity_SpriteProps.xy);
                Varyings output = CommonNormalsVertex(input);
                output.color = input.color * unity_SpriteColor;
                return output;
            }

            half4 NormalsFragment(Varyings input) : SV_Target
            {
                SetUpSpriteInstanceProperties();
                return CommonNormalsFragment(input, input.color);
            }
            ENDHLSL
        }
    }
}