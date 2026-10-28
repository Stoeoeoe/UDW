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
        _AnimationFps ("Animation Frames Per Second", Float) = 8
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
        _StillWater ("Still Water Enabled, Slosh Pixels, Slosh Period, Wind Patch Strength", Vector) = (0,1.5,6,0.6)
        _WindPatches ("Wind Patch Scale, Speed, Direction XY", Vector) = (48,4,1,0)
        _Current ("Current Enabled, Speed, Strength", Vector) = (0,0.3,1,0)
        [HideInInspector] _FlowMap ("Optional Flow Map", 2D) = "black" {}
        [HideInInspector] _FlowMapEnabled ("Flow Map Enabled", Float) = 0
        [HideInInspector] _FlowMapWorldRect ("Flow Map World Origin and Size", Vector) = (0,0,16,16)
        _SurfaceHighlights ("Surface Highlights Enabled, Intensity, Density, Speed", Vector) = (0,0.25,0.2,0.15)
        _SurfaceHighlightShape ("Surface Highlight Scale, Stretch X, Stretch Y", Vector) = (1,4,1,0)
        _ObjectReflections ("Object Reflections Enabled, Opacity, Ripple Pixels, Speed", Vector) = (0,0.35,1,0.5)
        _Interaction ("Ripples, Rain Splashes, Contact Foam", Vector) = (0,0,0,0)
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
            // Every pattern is built from whole logical pixels and whole animation ticks, so lines
            // are exactly one pixel thick and movement happens in pixel steps. Pattern maths runs on
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

            // Whole animation frames. Wraps every 65536 ticks (about two hours at 8 fps).
            uint Tick() { return uint(floor(_Time.y * _AnimationFps)) & 0xFFFFu; }

            int2 WorldPixel(float2 world) { return int2(floor(world * _PixelsPerUnit)); }
            uint2 Grid(int2 px) { return uint2(px) + GridBias; } // Wraps correctly for negative pixels.

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
            // Flowing water drifts every pattern in one direction. Still water (lakes, ponds) has no
            // net movement: each pattern sloshes back and forth by a pixel or two on its own clock,
            // wavelets reappear somewhere new each cycle, and wind patches wander across the surface.

            bool StillWater() { return _StillWater.x > 0; }

            // Whole-pixel back-and-forth offset. Each pattern passes its own phase, so the layers
            // never move as one rigid sheet.
            int2 Slosh(float seconds, float phase)
            {
                float w = 6.2832 * seconds / max(_StillWater.z, 0.5) + phase;
                return int2(round(float2(sin(w), 0.5 * sin(w * 0.73 + 1.3)) * _StillWater.y));
            }

            // 0 outside wind patches, up to 1 inside. Large, soft noise drifting with the wind.
            float WindPatch(int2 px, float seconds)
            {
                if (_StillWater.w <= 0) return 0;
                int2 offset = int2(round(_WindPatches.zw * _WindPatches.y * seconds));
                return smoothstep(0.45, 0.75, ValueNoise(px - offset, _WindPatches.x));
            }

            // Wavelets: short horizontal dashes that grow from the centre, hold, then shrink.
            // Each cycle picks a new length and position. Some add a shorter parallel dash below.
            half3 Ripples(uint2 g, uint tick, half3 color)
            {
                uint2 cellSize = uint2(max(int2(round(float2(16, 8) / _WaveScale)), int2(8, 4)));
                float seconds = tick / _AnimationFps;
                int2 drift = StillWater() ? Slosh(seconds, 0)
                    : int2(round(_FlowDirection.xy * (_WaveSpeed * seconds) * _PixelsPerUnit));
                uint2 p = g - uint2(drift);
                uint row = p.y / cellSize.y;
                uint stagger = uint(Rand(uint2(row, 0), 1u) * cellSize.x); // Stagger rows like brickwork.
                uint x = p.x + stagger;
                uint2 cell = uint2(x / cellSize.x, row);
                uint2 local = uint2(x % cellSize.x, p.y % cellSize.y);
                float phase = seconds * _WaveSpeed * 0.127 + Rand(cell, 2u);
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

                uint frame = min(uint(cycle / 0.56 * 3), 2u);          // short, full, short
                uint longest = cellSize.x - 2u;
                uint length = min(3u + uint(Rand(variant, 4u) * (longest - 2u)), longest);
                uint shown = frame == 1u ? length : max(length / 2u, 2u);
                uint centreX = 1u + uint(Rand(variant, 5u) * (cellSize.x - 1u - length)) + length / 2u;
                uint start = centreX - shown / 2u;
                uint crest = 1u + uint(Rand(variant, 6u) * (cellSize.y - 2u));
                if (local.y == crest && local.x >= start && local.x < start + shown) return _WaveColor.rgb;
                bool doubled = frame == 1u && shown >= 5u && Rand(variant, 7u) < 0.35;
                if (doubled && local.y + 1u == crest && local.x >= start + 2u && local.x < start + shown - 1u)
                    return _WaveColor.rgb;
                return color;
            }

            // Sparse one-to-three pixel glints on their own grid and clock.
            half3 Caustics(uint2 g, uint tick, half3 color)
            {
                if (_CausticIntensity <= 0) return color;
                uint size = uint(max(round(16 / _CausticScale), 4));
                float seconds = tick / _AnimationFps;
                int2 drift = StillWater() ? Slosh(seconds, 2.1)
                    : int2(round(float2(0.3, -0.2) * _WaveSpeed * seconds * _PixelsPerUnit));
                uint2 p = g - uint2(drift);
                uint2 cell = p / size;
                uint2 local = p % size;
                if (Rand(cell, 3u) > _CausticIntensity) return color; // Fraction of cells with a glint.
                float cycle = frac(seconds * _WaveSpeed * 0.3 + Rand(cell, 4u));
                if (cycle > 0.5) return color;
                uint frame = min(uint(cycle * 6), 2u); // dot, line, dot
                uint2 at = uint2(1u + uint(Rand(cell, 5u) * (size - 4u)), 1u + uint(Rand(cell, 6u) * (size - 2u)));
                uint length = frame == 1u ? 3u : 1u;
                uint start = at.x + (frame == 1u ? 0u : 1u);
                if (local.y == at.y && local.x >= start && local.x < start + length) return _HighlightColor.rgb;
                return color;
            }

            // Stretched one-pixel streaks with a single step in the middle.
            half3 Highlights(uint2 g, uint tick, half3 color)
            {
                if (!(_SurfaceHighlights.x > 0 && _SurfaceHighlights.y > 0 && _SurfaceHighlights.z > 0)) return color;
                uint2 size = uint2(max(int2(round(_SurfaceHighlightShape.yz / _SurfaceHighlightShape.x * _PixelsPerUnit)), int2(8, 3)));
                float seconds = tick / _AnimationFps;
                int2 drift = StillWater() ? Slosh(seconds, 4.4) * int2(2, 1)
                    : int2(round(_SurfaceHighlights.w * seconds * _PixelsPerUnit), 0);
                uint2 p = g - uint2(drift);
                uint2 cell = p / size;
                uint2 local = p % size;
                if (Rand(cell, 7u) >= _SurfaceHighlights.z) return color;
                float cycle = frac(seconds * _SurfaceHighlights.w * 0.5 + Rand(cell, 8u));
                if (cycle >= _SurfaceHighlights.y) return color;
                uint length = size.x / 4u + uint(Rand(cell, 9u) * (size.x / 2u));
                uint start = uint(Rand(cell, 10u) * (size.x - length));
                uint row = 1u + uint(Rand(cell, 11u) * (size.y - 2u));
                if (local.x < start || local.x >= start + length) return color;
                uint x = local.x - start;
                if (local.y == row + (x * 2u >= length ? 1u : 0u)) return _WaveColor.rgb;
                return color;
            }

            half3 SurfaceColor(uint2 g, uint tick, half3 water)
            {
                half3 color = water;
                color = Ripples(g, tick, color);
                color = Caustics(g, tick, color);
                color = Highlights(g, tick, color);
                return color;
            }

            // ---- Shoreline ------------------------------------------------------------------
            half3 Shoreline(float distance, uint2 g, uint tick, half3 color)
            {
                if (distance >= _ShorelineRange.y) return color;
                float seconds = tick / _AnimationFps;
                uint ring = uint(distance); // Each pixel belongs to exactly one integer ring.

                if (_ShorelineEffects.w > 0 && distance < _ShoreWaves.w)
                    color = _WaveColor.rgb;

                if (_ShorelineEffects.z > 0 && _ShoreWaves.x > 0 && _ShoreWaves.y > 0)
                {
                    uint spacing = uint(max(round(1 / _ShoreWaves.x), 2));
                    uint width = uint(clamp(round(_ShoreWaves.y), 1, spacing - 1));
                    uint shifted = ring + uint(round(_ShoreWaves.z * seconds)); // Whole pixels towards land.
                    uint wave = shifted / spacing;                             // Crest this ring is part of.
                    // Fade within half a spacing so ponds do not fill with nested outlines.
                    float coverage = 0.65 * saturate(1 - 2 * distance / spacing);
                    if (shifted % spacing < width && Rand(g / 8u + wave * 131u, 12u) < coverage)
                        color = _WaveColor.rgb;
                }

                if (_ShorelineEffects.y > 0 && distance < _Foam.x && _Foam.y > 0)
                {
                    // 3x1 foam blocks fade in and out on staggered clocks, denser on the bank row.
                    uint2 block = g / uint2(3u, 1u);
                    float cycle = frac(seconds * _Foam.z * 0.5 + Rand(block, 13u));
                    // Distances measure pixel centres: the first water row is 1 pixel from land.
                    float coverage = distance < 2 ? saturate(_Foam.y * 2) : _Foam.y;
                    if (cycle < coverage) color = _HighlightColor.rgb;
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
                // Tile chunks may be batched with a different object matrix. The bake belongs to
                // the WaterBody transform, including fractional map placement in the scene.
                int2 bodyPixel = int2(floor(mul(_WaterWorldToLocal, float4(input.world, 1)).xy * _PixelsPerUnit));
                uint2 g = Grid(px);
                uint tick = Tick();
                float seconds = tick / _AnimationFps;
                float2 p = (px + 0.5) / _PixelsPerUnit; // Pixel centre in world units.

                float distance = (_ShorelineEffects.x > 0 || _Depth.x > 0) ? ShoreDistance(bodyPixel) : _ShorelineRange.y;
                half3 water = lerp(_BaseColor.rgb, _DeepColor.rgb, DepthLevel(distance, px, g, seconds));

                half3 color;
                if (_Current.x > 0 && _Current.y > 0 && _Current.z > 0 && _FlowMapEnabled > 0)
                {
                    float2 flowUV = (p - _FlowMapWorldRect.xy) / _FlowMapWorldRect.zw;
                    float3 flow = SAMPLE_TEXTURE2D_LOD(_FlowMap, sampler_FlowMap, flowUV, 0).rgb;
                    // Byte 128 is exactly neutral; blue zero makes a stationary current.
                    float2 velocity = clamp((flow.rg * 255 - 128) / 127, -1, 1) * flow.b * _Current.z;
                    // Two overlapping two-unit scrolls, offset in whole pixels, dithered per pixel.
                    float phase = frac(seconds * _Current.y * 0.5);
                    int2 firstOffset = int2(round(velocity * (phase * 2) * _PixelsPerUnit));
                    int2 secondOffset = int2(round(velocity * (frac(phase + 0.5) * 2) * _PixelsPerUnit));
                    half3 first = SurfaceColor(g - uint2(firstOffset), tick, water);
                    half3 second = SurfaceColor(g - uint2(secondOffset), tick, water);
                    float weight = 1 - abs(phase * 2 - 1);
                    color = Rand(g, 14u) < weight ? first : second;
                }
                else
                {
                    uint2 surface = g;
                    if (_Current.x > 0)
                        surface -= uint2(int2(round(_FlowDirection.xy * (_Current.y * _Current.z * seconds) * _PixelsPerUnit)));
                    color = SurfaceColor(surface, tick, water);
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