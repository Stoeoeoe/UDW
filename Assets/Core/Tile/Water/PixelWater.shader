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
        _Current ("Current Enabled, Speed, Strength", Vector) = (0,0.3,1,0)
        [HideInInspector] _FlowMap ("Optional Flow Map", 2D) = "black" {}
        [HideInInspector] _FlowMapEnabled ("Flow Map Enabled", Float) = 0
        [HideInInspector] _FlowMapWorldRect ("Flow Map World Origin and Size", Vector) = (0,0,16,16)
        _SurfaceHighlights ("Surface Highlights Enabled, Intensity, Density, Speed", Vector) = (0,0.25,0.2,0.15)
        _SurfaceHighlightShape ("Surface Highlight Scale, Stretch X, Stretch Y", Vector) = (1,4,1,0)
        _ObjectReflections ("Object Reflections Enabled, Opacity, Ripple Pixels, Speed", Vector) = (0,0.35,1,0.5)
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
            float _PixelsPerUnit, _WaveSpeed, _WaveScale, _CausticIntensity, _CausticScale;
            float4 _FlowDirection;
            float4 _ShorelineLayout, _ShorelineRange, _ShorelineEffects, _Foam, _ShoreWaves;
            float4 _Current, _SurfaceHighlights, _SurfaceHighlightShape;
            float _FlowMapEnabled;
            float4 _FlowMapWorldRect;
            float4 _ObjectReflections;
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

            struct Attributes { COMMON_2D_INPUTS half4 color : COLOR; };
            struct Varyings
            {
                COMMON_2D_OUTPUTS_SHARED
                float3 world : TEXCOORD1;
                half2 lightingUV : TEXCOORD2;
                float2 localPosition : TEXCOORD3;
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
                output.localPosition = input.positionOS.xy;
                output.uv = input.uv;
                output.lightingUV = half2(ComputeScreenPos(output.positionCS / output.positionCS.w).xy);
                output.color = input.color * unity_SpriteColor;
                return output;
            }

            float Hash(float2 cell)
            {
                return frac(sin(dot(cell, float2(127.1, 311.7))) * 43758.5453);
            }

            float ShoreDistance(float2 localPosition)
            {
                float2 pixel = floor(localPosition * _PixelsPerUnit) - _ShorelineLayout.xy;
                float2 page = floor(pixel / _ShorelineRange.x);
                if (any(page < 0) || any(page >= _ShorelineLayout.zw)) return _ShorelineRange.y;
                float slice = SAMPLE_TEXTURE2D(_ShorelinePages, sampler_ShorelinePages,
                    (page + 0.5) / _ShorelineLayout.zw).r - 1;
                if (slice < 0) return _ShorelineRange.y; // Sparse page without water geometry.
                float2 uv = (pixel - page * _ShorelineRange.x + 0.5) / _ShorelineRange.x;
                return SAMPLE_TEXTURE2D_ARRAY(_ShorelineDistances, sampler_ShorelineDistances, uv, slice).r;
            }

            half3 SurfaceColor(float2 surface, float t)
            {
                float2 q = (surface - _FlowDirection.xy * t) * _WaveScale;
                // Sparse, short curved ripples instead of large contrasting blobs.
                float row = floor(q.y / 0.75);
                float2 ripple = float2(q.x / 1.6 + Hash(float2(row, 0)), q.y / 0.75);
                float2 cell = floor(ripple);
                float2 local = frac(ripple) - 0.5;
                float seed = Hash(cell);
                float crest = local.y - 0.12 * (1 - local.x * local.x * 4);
                float visible = sin(t * 0.8 + seed * 6.28318);
                half3 color = _BaseColor.rgb;
                if (seed > 0.4 && visible > -0.2 && abs(local.x) < 0.3)
                {
                    if (abs(crest) < 0.055) color = _WaveColor.rgb;
                    else if (abs(crest + 0.14) < 0.045) color = _DeepColor.rgb;
                }

                // Interfering wave ridges make moving, broken caustic lines in one palette color.
                float2 c = surface * _CausticScale;
                float caustic = abs(sin(c.x * 3.1 + sin(c.y * 2.7 + t * 0.7) + t)
                                  + sin(c.y * 3.6 + sin(c.x * 2.3 - t) - t * 0.8));
                color = (_CausticIntensity > 0 && caustic < _CausticIntensity * 0.12 && seed > 0.7)
                    ? _HighlightColor.rgb : color;

                if (_SurfaceHighlights.x > 0 && _SurfaceHighlights.y > 0 && _SurfaceHighlights.z > 0)
                {
                    float2 highlightPosition = surface * _SurfaceHighlightShape.x / _SurfaceHighlightShape.yz;
                    highlightPosition.x += _Time.y * _SurfaceHighlights.w;
                    float2 highlightCell = floor(highlightPosition);
                    float2 highlightLocal = frac(highlightPosition) - 0.5;
                    float highlightSeed = Hash(highlightCell + 31);
                    float pulse = 0.5 + 0.5 * sin(_Time.y * _SurfaceHighlights.w + highlightSeed * 6.28318);
                    float irregularWidth = 0.18 + Hash(highlightCell + 73) * 0.22;
                    if (highlightSeed < _SurfaceHighlights.z && pulse > 1 - _SurfaceHighlights.y &&
                        abs(highlightLocal.x) < irregularWidth &&
                        abs(highlightLocal.y + 0.04 * sin(highlightLocal.x * 8)) < 0.045)
                        color = _WaveColor.rgb;
                }
                return color;
            }

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
                // Atlas UVs remain untouched: only the procedural pattern uses world coordinates.
                half alpha = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, input.uv).a * input.color.a;
                float2 p = (floor(input.world.xy * _PixelsPerUnit) + 0.5) / _PixelsPerUnit;
                float t = _Time.y * _WaveSpeed;
                half3 color;
                if (_Current.x > 0 && _Current.y > 0 && _Current.z > 0 && _FlowMapEnabled > 0)
                {
                    float2 flowUV = (p - _FlowMapWorldRect.xy) / _FlowMapWorldRect.zw;
                    float3 flow = SAMPLE_TEXTURE2D_LOD(_FlowMap, sampler_FlowMap, flowUV, 0).rgb;
                    // Byte 128 is exactly neutral; blue zero makes a stationary current.
                    float2 velocity = clamp((flow.rg * 255 - 128) / 127, -1, 1) * flow.b * _Current.z;
                    // Two overlapping two-unit scrolls prevent divergent flow from stretching
                    // indefinitely. Stable logical-pixel dithering retains the exact palette.
                    float phase = frac(_Time.y * _Current.y * 0.5);
                    half3 first = SurfaceColor(p - velocity * (phase * 2), t);
                    half3 second = SurfaceColor(p - velocity * (frac(phase + 0.5) * 2), t);
                    float weight = 1 - abs(phase * 2 - 1);
                    color = Hash(floor(p * _PixelsPerUnit) + 113) < weight ? first : second;
                }
                else
                {
                    float2 surface = p;
                    if (_Current.x > 0)
                        surface -= _FlowDirection.xy * (_Current.y * _Current.z * _Time.y);
                    color = SurfaceColor(surface, t);
                }

                if (_ObjectReflections.x > 0 && _ObjectReflections.y > 0 && _WaterObjectReflectionAvailable > 0)
                {
                    float2 reflectedPoint = p;
                    reflectedPoint.x += round(sin(p.y * 8 + _Time.y * _ObjectReflections.w) * _ObjectReflections.z) / _PixelsPerUnit;
                    float4 reflectedClip = mul(_WaterObjectReflectionWorldToClip, float4(reflectedPoint, input.world.z, 1));
                    float2 reflectionUV = reflectedClip.xy / reflectedClip.w * 0.5 + 0.5;
                    if (all(reflectionUV >= 0) && all(reflectionUV <= 1))
                    {
                        half4 reflected = SAMPLE_TEXTURE2D(_WaterObjectReflectionTexture, sampler_WaterObjectReflectionTexture, reflectionUV);
                        if (reflected.a > 0 && Hash(floor(p * _PixelsPerUnit) + 97) < reflected.a * _ObjectReflections.y)
                            color = ReflectionPalette(reflected.rgb / reflected.a);
                    }
                }

                if (_ShorelineEffects.x > 0)
                {
                    float distance = ShoreDistance(input.localPosition);
                    if (distance < _ShorelineRange.y)
                    {
                        if (_ShorelineEffects.w > 0 && distance < _ShoreWaves.w)
                            color = _WaveColor.rgb;
                        // Increasing phase moves each distance contour towards land.
                        // Fade within half a wavelength: full distance contours form
                        // nested angular outlines where opposing banks meet in ponds.
                        float phase = frac((distance + _Time.y * _ShoreWaves.z) * _ShoreWaves.x);
                        float coastPatch = Hash(floor(p * _PixelsPerUnit / 4));
                        float waveCoverage = 0.65 * saturate(1 - 2 * distance * _ShoreWaves.x);
                        if (_ShorelineEffects.z > 0 && _ShoreWaves.x > 0 && _ShoreWaves.y > 0 &&
                            phase < _ShoreWaves.y * _ShoreWaves.x &&
                            coastPatch > 1 - waveCoverage)
                            color = _WaveColor.rgb;
                        if (_ShorelineEffects.y > 0 && distance < _Foam.x && _Foam.y > 0)
                        {
                            float foam = Hash(floor(p * _PixelsPerUnit / float2(3,2)) +
                                float2(floor(_Time.y * _Foam.z), 17));
                            if (foam < _Foam.y) color = _HighlightColor.rgb;
                        }
                    }
                }

                // Use the same 2D light composition as Sprite-Lit-Default: daylight,
                // local lights and renderer tint modulate every palette entry.
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



