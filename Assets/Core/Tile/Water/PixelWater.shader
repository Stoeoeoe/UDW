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
            float4 _ShorelineLayout, _ShorelineRange, _ShorelineEffects, _Foam, _ShoreWaves, _Depth;
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

            // ---- Integer pixel grid helpers ---------------------------------------------------
            // Every pattern is built from whole logical pixels and whole animation ticks,
            // so lines are exactly one pixel thick and movement happens in pixel steps.

            int FloorDiv(int a, int b) { return (a - (a < 0 ? b - 1 : 0)) / b; }
            int2 FloorDiv2(int2 a, int2 b) { return int2(FloorDiv(a.x, b.x), FloorDiv(a.y, b.y)); }
            int Mod(int a, int b) { return a - FloorDiv(a, b) * b; }

            uint Pcg(uint v)
            {
                uint state = v * 747796405u + 2891336453u;
                uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
                return (word >> 22u) ^ word;
            }

            // Stable integer hash: no sin() precision loss at large world coordinates.
            float Rand(int2 cell, uint salt)
            {
                uint h = Pcg(Pcg(asuint(cell.x) ^ (salt * 0x9E3779B9u)) + asuint(cell.y));
                return float(h) * (1.0 / 4294967296.0);
            }

            // Whole animation frames. Wraps every 65536 ticks (about two hours at 8 fps).
            int Tick() { return int(floor(_Time.y * _AnimationFps)) & 0xFFFF; }

            int2 WorldPixel(float2 world) { return int2(floor(world * _PixelsPerUnit)); }

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
                int chunk = int(_ShorelineRange.x);
                int2 page = FloorDiv2(pixel, int2(chunk, chunk));
                if (any(page < 0) || any(page >= int2(_ShorelineLayout.zw))) return _ShorelineRange.y;
                float slice = SAMPLE_TEXTURE2D_LOD(_ShorelinePages, sampler_ShorelinePages,
                    (page + 0.5) / _ShorelineLayout.zw, 0).r - 1;
                if (slice < 0) return _ShorelineRange.y; // Sparse page without water geometry.
                float2 uv = (pixel - page * chunk + 0.5) / chunk;
                return SAMPLE_TEXTURE2D_ARRAY_LOD(_ShorelineDistances, sampler_ShorelineDistances, uv, slice, 0).r;
            }

            // ---- Depth ----------------------------------------------------------------------
            static const int BayerMatrix[16] = { 0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5 };

            // Deep color beyond the start distance, with an ordered-dither band. World pixels keep
            // the dither stable across bodies and while the camera moves.
            bool IsDeep(float distance, int2 px)
            {
                if (_Depth.x <= 0) return false;
                if (_Depth.z <= 0) return distance >= _Depth.y;
                float threshold = (BayerMatrix[Mod(px.x, 4) + Mod(px.y, 4) * 4] + 0.5) / 16;
                return (distance - _Depth.y) / _Depth.z > threshold;
            }

            // ---- Surface patterns -----------------------------------------------------------

            // Short curved crests drawn as pixel rows inside staggered integer cells.
            half3 Ripples(int2 px, int tick, half3 color, bool deep)
            {
                int2 cellSize = max(int2(round(float2(16, 8) / _WaveScale)), int2(6, 4));
                float seconds = tick / _AnimationFps;
                int2 drift = int2(round(_FlowDirection.xy * (_WaveSpeed * seconds) * _PixelsPerUnit));
                int2 p = px - drift;
                int row = FloorDiv(p.y, cellSize.y);
                int stagger = int(Rand(int2(row, 0), 1u) * cellSize.x);
                int2 cell = int2(FloorDiv(p.x + stagger, cellSize.x), row);
                int2 local = int2(Mod(p.x + stagger, cellSize.x), Mod(p.y, cellSize.y));
                float seed = Rand(cell, 2u);
                if (seed < 0.4) return color;
                // Staggered life cycle: grow, hold, shrink, pause.
                float cycle = frac(seconds * _WaveSpeed * 0.127 + seed);
                if (cycle >= 0.56) return color;
                int frame = min(int(cycle / 0.56 * 3), 2);
                int shrink = frame == 1 ? 0 : 1;
                int x0 = cellSize.x / 4 + shrink;
                int x1 = cellSize.x - cellSize.x / 4 - 1 - shrink;
                if (local.x < x0 || local.x > x1) return color;
                int mid = cellSize.y / 2;
                bool endPixel = local.x == x0 || local.x == x1;
                int crestY = endPixel ? mid - 1 : mid; // Ends droop one pixel: a curved crest.
                if (local.y == crestY) return _WaveColor.rgb;
                // The trough line would vanish on deep water, so it is only drawn on the base color.
                if (!deep && frame >= 1 && !endPixel && local.y == mid - 2) return _DeepColor.rgb;
                return color;
            }

            // Sparse one-to-three pixel glints on their own grid and clock.
            half3 Caustics(int2 px, int tick, half3 color)
            {
                if (_CausticIntensity <= 0) return color;
                int size = max(int(round(16 / _CausticScale)), 4);
                float seconds = tick / _AnimationFps;
                int2 p = px - int2(round(float2(0.3, -0.2) * _WaveSpeed * seconds * _PixelsPerUnit));
                int2 cell = FloorDiv2(p, int2(size, size));
                int2 local = p - cell * size;
                if (Rand(cell, 3u) > _CausticIntensity) return color; // Fraction of cells with a glint.
                float cycle = frac(seconds * _WaveSpeed * 0.3 + Rand(cell, 4u));
                if (cycle > 0.5) return color;
                int frame = min(int(cycle * 6), 2); // dot, line, dot
                int2 at = int2(1 + int(Rand(cell, 5u) * (size - 4)), 1 + int(Rand(cell, 6u) * (size - 2)));
                int length = frame == 1 ? 3 : 1;
                int start = at.x + (frame == 1 ? 0 : 1);
                if (local.y == at.y && local.x >= start && local.x < start + length) return _HighlightColor.rgb;
                return color;
            }

            // Stretched one-pixel streaks with a single step in the middle.
            half3 Highlights(int2 px, int tick, half3 color)
            {
                if (!(_SurfaceHighlights.x > 0 && _SurfaceHighlights.y > 0 && _SurfaceHighlights.z > 0)) return color;
                int2 size = max(int2(round(_SurfaceHighlightShape.yz / _SurfaceHighlightShape.x * _PixelsPerUnit)), int2(8, 3));
                float seconds = tick / _AnimationFps;
                int2 p = px - int2(round(_SurfaceHighlights.w * seconds * _PixelsPerUnit), 0);
                int2 cell = FloorDiv2(p, size);
                int2 local = p - cell * size;
                if (Rand(cell, 7u) >= _SurfaceHighlights.z) return color;
                float cycle = frac(seconds * _SurfaceHighlights.w * 0.5 + Rand(cell, 8u));
                if (cycle >= _SurfaceHighlights.y) return color;
                int length = size.x / 4 + int(Rand(cell, 9u) * (size.x / 2));
                int start = int(Rand(cell, 10u) * (size.x - length));
                int row = 1 + int(Rand(cell, 11u) * (size.y - 2));
                int x = local.x - start;
                if (x < 0 || x >= length) return color;
                if (local.y == row + (x * 2 >= length ? 1 : 0)) return _WaveColor.rgb;
                return color;
            }

            half3 SurfaceColor(int2 px, int tick, bool deep)
            {
                half3 color = deep ? _DeepColor.rgb : _BaseColor.rgb;
                color = Ripples(px, tick, color, deep);
                color = Caustics(px, tick, color);
                color = Highlights(px, tick, color);
                return color;
            }

            // ---- Shoreline ------------------------------------------------------------------
            half3 Shoreline(float distance, int2 px, int tick, half3 color)
            {
                if (distance >= _ShorelineRange.y) return color;
                float seconds = tick / _AnimationFps;
                int ring = int(floor(distance)); // Each pixel belongs to exactly one integer ring.

                if (_ShorelineEffects.w > 0 && distance < _ShoreWaves.w)
                    color = _WaveColor.rgb;

                if (_ShorelineEffects.z > 0 && _ShoreWaves.x > 0 && _ShoreWaves.y > 0)
                {
                    int spacing = max(int(round(1 / _ShoreWaves.x)), 2);
                    int width = clamp(int(round(_ShoreWaves.y)), 1, spacing - 1);
                    int travel = int(round(_ShoreWaves.z * seconds)); // Whole pixels towards land.
                    int shifted = ring + travel;
                    int wave = FloorDiv(shifted, spacing);           // Index of the crest this ring is part of.
                    // Fade within half a spacing so ponds do not fill with nested outlines.
                    float coverage = 0.65 * saturate(1 - 2 * distance / spacing);
                    if (Mod(shifted, spacing) < width && Rand(FloorDiv2(px, int2(8, 8)) + wave * 131, 12u) < coverage)
                        color = _WaveColor.rgb;
                }

                if (_ShorelineEffects.y > 0 && distance < _Foam.x && _Foam.y > 0)
                {
                    // 3x1 foam blocks fade in and out on staggered clocks, denser on the bank row.
                    int2 block = FloorDiv2(px, int2(3, 1));
                    float cycle = frac(seconds * _Foam.z * 0.5 + Rand(block, 13u));
                    // Distances measure pixel centres: the first water row is 1 pixel from land.
                    float coverage = distance < 2 ? saturate(_Foam.y * 2) : _Foam.y;
                    if (cycle < coverage) color = _HighlightColor.rgb;
                }
                return color;
            }

            // ---- Interaction ----------------------------------------------------------------

            // Foam ring around objects standing in water, plus a slow lapping ring outside it.
            half3 ContactFoam(int2 px, int tick, half3 color)
            {
                if (_Interaction.z <= 0) return color;
                int count = min(int(_WaterContactCount), WATER_MAX_CONTACTS);
                for (int i = 0; i < count; i++)
                {
                    float4 contact = _WaterContacts[i];
                    int2 center = WorldPixel(contact.xy);
                    int2 d = px - center;
                    float2 radius = contact.zw;
                    if (any(abs(d) > int2(radius) + 3)) continue;
                    int localTick = tick + int(Rand(center, 41u) * 12); // Desync neighbouring objects.
                    if (EllipseEdge(d, radius))
                    {
                        if (Rand(px, 30u + uint(localTick / 4)) < 0.75) color = _HighlightColor.rgb;
                        continue;
                    }
                    int lap = Mod(localTick / 3, 4); // 0 rest, 1 and 2 lap outwards, 3 rest
                    if (lap > 0 && lap < 3 && EllipseEdge(d, radius + lap) && Rand(px, 40u + uint(localTick / 3)) < 0.5)
                        color = _WaveColor.rgb;
                }
                return color;
            }

            // Expanding rings from steps, splashes, bobbers and other gameplay events.
            half3 InteractionRipples(int2 px, half3 color)
            {
                if (_Interaction.x <= 0) return color;
                for (int i = 0; i < WATER_MAX_RIPPLES; i++)
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
                    if (life > 0.5 && Rand(px, 16u + uint(radius)) < (life - 0.5) * 1.6) continue;
                    color = edge && life < 0.34 ? _HighlightColor.rgb : _WaveColor.rgb;
                }
                return color;
            }

            // Three-frame raindrop splashes: dot, pair, small ring. One possible drop per 8x8 cell.
            half3 RainSplashes(int2 px, int tick, half3 color)
            {
                if (_Interaction.y <= 0 || _WaterRain <= 0) return color;
                const int size = 8;
                const int period = 12;
                int2 cell = FloorDiv2(px, int2(size, size));
                int2 local = px - cell * size;
                int shifted = tick + int(Rand(cell, 20u) * period);
                int cycle = FloorDiv(shifted, period);
                int age = shifted - cycle * period;
                if (age > 2) return color;
                int2 drop = cell + int2(cycle * 7, cycle * 13); // New spot and chance every cycle.
                if (Rand(drop, 21u) >= _WaterRain) return color;
                int2 at = int2(2 + int(Rand(drop, 22u) * (size - 4)), 1 + int(Rand(drop, 23u) * (size - 2)));
                int2 d = local - at;
                if (age == 0 && all(d == 0)) return _HighlightColor.rgb;
                if (age == 1 && d.y == 0 && abs(d.x) == 1) return _HighlightColor.rgb;
                if (age == 2 && EllipseEdge(d, float2(2, 1))) return _WaveColor.rgb;
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
                int tick = Tick();
                float seconds = tick / _AnimationFps;
                float2 p = (px + 0.5) / _PixelsPerUnit; // Pixel centre in world units.

                float distance = (_ShorelineEffects.x > 0 || _Depth.x > 0) ? ShoreDistance(bodyPixel) : _ShorelineRange.y;
                bool deep = IsDeep(distance, px);

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
                    half3 first = SurfaceColor(px - firstOffset, tick, deep);
                    half3 second = SurfaceColor(px - secondOffset, tick, deep);
                    float weight = 1 - abs(phase * 2 - 1);
                    color = Rand(px, 14u) < weight ? first : second;
                }
                else
                {
                    int2 surface = px;
                    if (_Current.x > 0)
                        surface -= int2(round(_FlowDirection.xy * (_Current.y * _Current.z * seconds) * _PixelsPerUnit));
                    color = SurfaceColor(surface, tick, deep);
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
                        if (reflected.a > 0 && Rand(px, 15u) < reflected.a * _ObjectReflections.y)
                            color = ReflectionPalette(reflected.rgb / reflected.a);
                    }
                }

                if (_ShorelineEffects.x > 0)
                    color = Shoreline(distance, px, tick, color);

                // Interaction draws last so it reads on top of reflections and shore effects.
                color = ContactFoam(px, tick, color);
                color = InteractionRipples(px, color);
                color = RainSplashes(px, tick, color);

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
