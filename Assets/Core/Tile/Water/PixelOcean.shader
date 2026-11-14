Shader "UrdewValley/Pixel Ocean"
{
    Properties
    {
        [PerRendererData] _MainTex ("Sprite Mask", 2D) = "white" {}
        [HideInInspector] _NormalMap ("Normal Map", 2D) = "bump" {}
        _BaseColor ("Base", Color) = (0.141,0.314,0.431,1)
        _DeepColor ("Deep", Color) = (0.09,0.196,0.31,1)
        _WaveColor ("Wave", Color) = (0.239,0.435,0.56,1)
        _HighlightColor ("Foam", Color) = (0.718,0.804,0.82,1)
        _PixelsPerUnit ("Pixels Per Unit", Float) = 16
        _AnimationFps ("Animation FPS", Float) = 12
        [HideInInspector] _ShorelineDistances ("Shoreline Distances", 2DArray) = "" {}
        [HideInInspector] _ShorelinePages ("Shoreline Pages", 2D) = "black" {}
        [HideInInspector] _ShorelineLayout ("Shoreline Layout", Vector) = (0,0,1,1)
        [HideInInspector] _ShorelineRange ("Shoreline Range", Vector) = (128,32,0,0)
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
            half4 _BaseColor, _DeepColor, _WaveColor, _HighlightColor;
            float _PixelsPerUnit, _AnimationFps;
            float _CausticIntensity, _CausticScale;
            float4 _OceanSurface; // Beach slope width, wobble pixels, wobble period.
            float4 _ShorelineLayout, _ShorelineRange, _Depth, _DepthShape;
            float4 _Swell, _SwellShape, _Surf, _SwellLook;
            float4 _ShorelineEffects, _Foam, _ObjectReflections, _Interaction;
            float4x4 _WaterWorldToLocal;
        CBUFFER_END
        ENDHLSL

        // Three layers: quiet depth, broken offshore swells, and a coast-following wash.
        Pass
        {
            Tags { "LightMode"="Universal2D" }
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma target 3.5
            #pragma multi_compile_instancing
            #include_with_pragmas "Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/ShapeLightShared.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/CombinedShapeLightShared.hlsl"
            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);
            TEXTURE2D_ARRAY(_ShorelineDistances);
            SAMPLER(sampler_ShorelineDistances);
            TEXTURE2D(_ShorelinePages);
            SAMPLER(sampler_ShorelinePages);
            TEXTURE2D(_WaterObjectReflectionTexture);
            SAMPLER(sampler_WaterObjectReflectionTexture);
            float4x4 _WaterObjectReflectionWorldToClip;
            float _WaterObjectReflectionAvailable, _WaterSeaState;
            // Matches WaterInteraction.MaxRipples / MaxContacts.
            float4 _WaterRipples[16], _WaterContacts[32];
            float _WaterContactCount, _WaterInteractionClock, _WaterRain;

            struct Attributes { COMMON_2D_INPUTS half4 color : COLOR; };
            struct Varyings
            {
                COMMON_2D_OUTPUTS_SHARED
                half2 lightingUV : TEXCOORD1;
                float3 world : TEXCOORD2;
                half4 color : COLOR;
            };

            Varyings Vert(Attributes input)
            {
                Varyings output = (Varyings)0;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
                SetUpSpriteInstanceProperties();
                input.positionOS = UnityFlipSprite(input.positionOS, unity_SpriteProps.xy);
                output.positionCS = TransformObjectToHClip(input.positionOS);
                output.world = TransformObjectToWorld(input.positionOS);
                output.uv = input.uv;
                output.lightingUV = half2(ComputeScreenPos(output.positionCS / output.positionCS.w).xy);
                output.color = input.color * unity_SpriteColor;
                return output;
            }

            float Hash(float2 p)
            {
                uint2 cell = asuint(int2(p));
                uint h = cell.x * 1597334677u ^ cell.y * 3812015801u;
                h = (h ^ (h >> 16)) * 2246822519u;
                return float(h ^ (h >> 13)) * (1.0 / 4294967296.0);
            }

            float Noise(float2 p)
            {
                float2 cell = floor(p), f = frac(p);
                f = f * f * (3 - 2 * f);
                return lerp(lerp(Hash(cell), Hash(cell + float2(1,0)), f.x),
                    lerp(Hash(cell + float2(0,1)), Hash(cell + 1), f.x), f.y);
            }

            float ShoreSample(int2 bodyPixel)
            {
                int2 pixel = bodyPixel - int2(_ShorelineLayout.xy);
                if (any(pixel < 0)) return _ShorelineRange.y;
                uint chunk = uint(_ShorelineRange.x);
                uint2 local = uint2(pixel), page = local / chunk;
                if (any(page >= uint2(_ShorelineLayout.zw))) return _ShorelineRange.y;
                float slice = SAMPLE_TEXTURE2D_LOD(_ShorelinePages, sampler_ShorelinePages,
                    (page + 0.5) / _ShorelineLayout.zw, 0).r - 1;
                if (slice < 0) return _ShorelineRange.y; // Unallocated open-water page.
                return SAMPLE_TEXTURE2D_ARRAY_LOD(_ShorelineDistances, sampler_ShorelineDistances,
                    (local % chunk + 0.5) / chunk, slice, 0).r;
            }

            float ShoreDistance(float3 world)
            {
                // Interpolate the logical-pixel bake across page boundaries, then draw on a
                // half-pixel grid. This makes a moving foam front step rather than jump a full pixel.
                float2 p = mul(_WaterWorldToLocal, float4(world,1)).xy * _PixelsPerUnit - 0.5;
                int2 cell = int2(floor(p));
                float2 f = frac(p);
                return lerp(lerp(ShoreSample(cell), ShoreSample(cell + int2(1,0)), f.x),
                    lerp(ShoreSample(cell + int2(0,1)), ShoreSample(cell + 1), f.x), f.y);
            }

            float Steps(float value, float levels) { return floor(saturate(value) * levels + 0.5) / levels; }

            float2 SurfaceWobble(float2 p, float seconds)
            {
                float phase = seconds * 6.2831853 / _OceanSurface.z;
                return float2(sin(p.y * 0.065 + phase), cos(p.x * 0.05 - phase)) * _OceanSurface.y;
            }

            float Caustics(float2 p, float seconds)
            {
                // Moving cellular seams, sampled once per logical pixel (normally 16 PPU).
                // Cell centres oscillate rather than reseed, so the light net flexes without popping.
                float2 q = (p + SurfaceWobble(p, seconds)) * (_CausticScale / 16);
                q += sin(q.yx * 1.7 + seconds * 0.3) * 0.22;
                float2 cell = floor(q), local = frac(q);
                float nearest = 10, second = 10;
                [unroll] for (int y = -1; y <= 1; y++)
                    [unroll] for (int x = -1; x <= 1; x++)
                    {
                        float2 neighbour = float2(x,y);
                        float2 seed = float2(Hash(cell + neighbour), Hash(cell + neighbour + 37));
                        float2 cellCenter = 0.5 + 0.3 * sin(seed * 6.2831853 + seconds * 0.65);
                        float2 delta = neighbour + cellCenter - local;
                        float d = dot(delta, delta);
                        second = min(second, max(nearest, d));
                        nearest = min(nearest, d);
                    }
                return Steps(1 - smoothstep(0.025, 0.16, second - nearest), 3);
            }

            half3 Ocean(float2 pixel, float distance, float seconds)
            {
                float2 p = floor(pixel) + 0.5;
                float2 fine = (floor(pixel * 2) + 0.5) * 0.5;
                float storm = _WaterSeaState;
                // Static broad contours: depth does not breathe or crawl with the waves.
                float depth = distance + (Noise(p / _DepthShape.z) - 0.5) * _DepthShape.y * 2;
                float deep = _Depth.z > 0 ? saturate((depth - _Depth.y) / _Depth.z) : step(_Depth.y, depth);
                half3 color = lerp(_BaseColor.rgb, _DeepColor.rgb, _Depth.x * Steps(deep, 5));

                if (_CausticIntensity > 0)
                {
                    float start = max(_OceanSurface.x, _Depth.x > 0 ? _Depth.y : 0);
                    float end = _Depth.x > 0 ? max(start, _Depth.y + _Depth.z) : _ShorelineRange.y;
                    float offshore = end > start ? smoothstep(start, end, distance) : step(start, distance);
                    color = lerp(color, _HighlightColor.rgb, Caustics(p, seconds) * offshore * _CausticIntensity);
                }

                if (_Swell.x > 0)
                {
                    float2 wobble = SurfaceWobble(p, seconds);
                    p += wobble;
                    fine += wobble;
                    float2 travel = _SwellShape.xy;
                    float2 across = float2(travel.y, -travel.x);
                    float along = dot(p, across), forward = dot(p, travel);
                    float drift = seconds * _Swell.z;
                    float bend = (Noise(float2(along / 40, (forward - drift * 0.3) / 72)) - 0.5) * _Surf.w * 14;
                    float phase = (forward + bend - drift) / _Swell.y;
                    float roll = cos(phase * 6.2831853);
                    float offshore = smoothstep(2, _Surf.x, distance);
                    float body = Steps(saturate(roll * 0.5 + 0.5), 4);
                    color = lerp(color, _WaveColor.rgb, body * _SwellLook.y * offshore * (0.55 + storm * 0.25));

                    // Long, irregular stretches with tapered ends. Shape travels with each crest;
                    // no per-frame random pixels and no second crossing wave train.
                    float stretch = Noise(float2(along / _SwellLook.z, floor(phase + 0.5) * 2.71));
                    float coverage = smoothstep(_SwellShape.z * 0.72, _SwellShape.z * 0.72 + 0.22, stretch);
                    float finePhase = (dot(fine, travel) + bend - drift) / _Swell.y;
                    float crestDistance = abs(frac(finePhase + 0.5) - 0.5) * _Swell.y;
                    float width = (_Swell.w + storm * 0.5) * coverage;
                    float crest = (1 - smoothstep(width * 0.3, width + 0.5, crestDistance)) * coverage * offshore;
                    color = lerp(color, _WaveColor.rgb, Steps(crest, 3) * 0.65);
                    float whitecap = smoothstep(0.72, 0.9, stretch) * crest * storm;
                    color = lerp(color, _HighlightColor.rgb, Steps(whitecap, 3) * 0.65);
                }

                return color;
            }

            half3 CoastalWash(float2 pixel, float distance, float seconds, half3 color, out float coverage)
            {
                coverage = 0;
                float2 p = floor(pixel) + 0.5;
                float2 fine = (floor(pixel * 2) + 0.5) * 0.5;
                if (_ShorelineEffects.x > 0 && _ShorelineEffects.y > 0 && _Surf.y > 0)
                {
                    float zone = _Surf.y * (1 + _WaterSeaState);
                    // Positive distance + time sends the crest towards land on every coast.
                    // Phase offsets vary slowly along the coast, avoiding synchronized rings.
                    float coastOffset = Noise(p / 48) * 0.24;
                    float cycle = frac(seconds * _Foam.z + coastOffset);
                    float front = zone * (1 - cycle);
                    float ragged = (Noise(fine / float2(5,3)) - 0.5) * 1.5;
                    float behind = distance + ragged - front;
                    float arrival = smoothstep(0, 0.18, cycle);
                    float retreat = 1 - smoothstep(0.86, 1, cycle);
                    float envelope = arrival * retreat;
                    float edge = 1 - smoothstep(0.35, 1.1, abs(behind));
                    float wash = step(0, behind) * (1 - smoothstep(0, max(_Surf.z, 0.5), behind));
                    float lace = Noise(fine / float2(2.5,1.5) + float2(cycle * 0.8, 0));
                    wash *= smoothstep(0.3, 0.65, lace) * 0.6;
                    float shoreFade = 1 - smoothstep(zone * 0.75, zone + 1, distance);
                    float stretches = smoothstep(0.25, 0.55, Noise(p / 9 + float2(cycle * 0.2, 0)));
                    float foam = max(edge * stretches, wash) * envelope * shoreFade * saturate(_Foam.y * 2);
                    coverage = Steps(foam, 4);
                    color = lerp(color, _HighlightColor.rgb, coverage);
                    // Small interrupted residual foam, not a permanent white outline.
                    float rim = (1 - smoothstep(0.75, _Foam.x + 0.75, distance)) *
                        smoothstep(0.5, 0.75, Noise(p / 4 + cycle * 0.3)) * 0.25;
                    float rimCoverage = Steps(rim * _Foam.y, 4);
                    color = lerp(color, _HighlightColor.rgb, rimCoverage);
                    coverage = max(coverage, rimCoverage);
                }
                return color;
            }

            float Ring(float2 offset, float2 radius)
            {
                float d = length(offset / radius);
                return 1 - smoothstep(0.35, 1, abs(d - 1) * min(radius.x, radius.y));
            }

            half3 Interactions(float2 p, float seconds, half3 color)
            {
                float foam = 0;
                if (_Interaction.x > 0)
                    for (uint i = 0; i < 16; i++)
                    {
                        float4 ripple = _WaterRipples[i];
                        float age = _WaterInteractionClock - ripple.z;
                        float radius = 1 + floor(age * _AnimationFps);
                        if (ripple.w <= 0 || age < 0 || radius > ripple.w) continue;
                        float2 offset = p - floor(ripple.xy * _PixelsPerUnit) - 0.5;
                        foam = max(foam, Ring(offset, float2(radius, max(1, radius * 0.5))) * (1 - radius / (ripple.w + 1)));
                    }
                if (_Interaction.z > 0)
                    for (uint j = 0; j < uint(_WaterContactCount); j++)
                    {
                        float4 contact = _WaterContacts[j];
                        float2 offset = p - floor(contact.xy * _PixelsPerUnit) - 0.5;
                        foam = max(foam, Ring(offset, contact.zw + 0.5) * 0.6);
                    }
                if (_Interaction.y > 0 && _WaterRain > 0)
                {
                    float2 cell = floor(p / 8), local = p - cell * 8;
                    float clock = seconds * 2 + Hash(cell);
                    float seed = Hash(cell + floor(clock) * 17);
                    float2 center = 2 + float2(seed, Hash(cell + floor(clock) * 31)) * 4;
                    float age = frac(clock);
                    float drop = Ring(local - center, float2(1 + age * 2, 0.75 + age));
                    foam = max(foam, drop * (1 - age) * step(seed, _WaterRain) * 0.55);
                }
                return lerp(color, _HighlightColor.rgb, Steps(foam, 4));
            }

            half4 Frag(Varyings input) : SV_Target
            {
                half mask = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, input.uv).a;
                clip(mask - 0.5);
                float2 pixel = input.world.xy * _PixelsPerUnit;
                float2 fineWorld = (floor(pixel * 2) + 0.5) / (2 * _PixelsPerUnit);
                float distance = ShoreDistance(float3(fineWorld, input.world.z));
                float seconds = floor(_Time.y * _AnimationFps) / _AnimationFps;
                half3 color = Ocean(pixel, distance, seconds);
                if (_ObjectReflections.x > 0 && _WaterObjectReflectionAvailable > 0)
                {
                    float2 reflectedPoint = fineWorld;
                    reflectedPoint.x += round(sin(floor(pixel.y) * 0.18 + seconds * _ObjectReflections.w) *
                        _ObjectReflections.z * 2) / (2 * _PixelsPerUnit);
                    float4 reflectedClip = mul(_WaterObjectReflectionWorldToClip, float4(reflectedPoint, input.world.z, 1));
                    float2 uv = reflectedClip.xy / reflectedClip.w * 0.5 + 0.5;
                    if (all(uv >= 0) && all(uv <= 1))
                    {
                        half4 reflected = SAMPLE_TEXTURE2D(_WaterObjectReflectionTexture, sampler_WaterObjectReflectionTexture, uv);
                        // The capture is premultiplied. Tint and subdue it without palette speckle.
                        color = color * (1 - reflected.a * _ObjectReflections.y) +
                            reflected.rgb * lerp(half3(1,1,1), _BaseColor.rgb, 0.35) * _ObjectReflections.y;
                    }
                }
                float foamCoverage;
                color = CoastalWash(pixel, distance, seconds, color, foamCoverage);
                color = Interactions(floor(pixel) + 0.5, seconds, color);
                // The first baked water centre is one pixel from land. Fade from that edge
                // over the authored slope, revealing ground beneath without changing the mask.
                float opacity = _OceanSurface.x > 0 ? smoothstep(0, _OceanSurface.x, max(0, distance - 0.5)) : 1;
                opacity = max(opacity, foamCoverage);
                SurfaceData2D surfaceData;
                InputData2D inputData;
                InitializeSurfaceData(color * input.color.rgb, input.color.a * opacity,
                    half4(1,1,1,1), half3(0,0,1), surfaceData);
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
