Shader "Custom/PixelRain"
{
    Properties
    {
        _RainColor("Rain Color", Color) = (0.6, 0.7, 0.8, 0.5)
        _Density("Density (0.95 = Light, 0.8 = Heavy)", Range(0.5, 1)) = 0.95
        _Speed("Fall Speed", Float) = 0.5
        _Wind("Wind Direction (X-Axis)", Range(-1, 1)) = 0.2
        _VerticalStretch("Rain Streak Length", Float) = 20.0
        _PixelResolution("Pixel Resolution (Match Game)", Vector) = (480, 270, 0, 0)
    }

    SubShader
    {
        Tags
        {
            "RenderType"="Opaque" "RenderPipeline" = "UniversalPipeline"
        }
        LOD 100
        ZWrite Off Cull Off

        Pass
        {
            Name "PixelRainPass"

            HLSLPROGRAM
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.core/ShaderLibrary/Common.hlsl"

            TEXTURE2D_X(_BlitTexture);
            SAMPLER(sampler_BlitTexture);

            #pragma vertex Vert
            #pragma fragment Frag

            struct Attributes
            {
                uint vertexID : SV_VertexID;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 texcoord : TEXCOORD0;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            CBUFFER_START(UnityPerMaterial)
                float4 _RainColor;
                float _Density;
                float _Speed;
                float _Wind;
                float _VerticalStretch;
                float4 _PixelResolution;
            CBUFFER_END

            Varyings Vert(Attributes input)
            {
                Varyings output;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);

                float4 pos = GetFullScreenTriangleVertexPosition(input.vertexID);
                float2 uv = GetFullScreenTriangleTexCoord(input.vertexID);

                output.positionCS = pos;
                output.texcoord = uv;

                return output;
            }

            float Random(float2 uv)
            {
                return frac(sin(dot(uv, float2(12.9898, 78.233))) * 43758.5453123);
            }

            half4 Frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);

                float2 uv = input.texcoord;
                float2 grid = _PixelResolution.xy;
                float time = _Time.y * _Speed;

                // 1. Prepare 2 different scales for variety
                float2 rainUV1 = float2(uv.x - time * _Wind, uv.y + time);
                float2 rainUV2 = float2(uv.x - (time * 1.4) * _Wind, (uv.y * 0.8) + (time * 1.4));

                // 2. Snap to pixel grid
                float2 pUV1 = floor(rainUV1 * grid) / grid;
                float2 pUV2 = floor(rainUV2 * grid) / grid;

                // 3. Create THE NOISE MASK
                // We stretch the UVs BEFORE the noise to create "Sausage" shapes
                float2 noiseUV1 = float2(pUV1.x * 4.0, pUV1.y / _VerticalStretch);
                float2 noiseUV2 = float2(pUV2.x * 6.0, pUV2.y / (_VerticalStretch * 1.5));

                // Generate smooth-ish noise (using a simple hash-based pseudo-gradient)
                float mask1 = Random(floor(noiseUV1 * 100.0) / 100.0);
                float mask2 = Random(floor(noiseUV2 * 100.0) / 100.0);

                // 4. Thresholding (The "Disappearing" Logic)
                // By comparing noise to a threshold, only the "brightest" parts of 
                // the stretched noise sausages become visible raindrops.
                float finalMask1 = step(_Density, mask1);
                float finalMask2 = step(_Density + 0.03, mask2);

                float combinedMask = saturate(finalMask1 + finalMask2);

                // 4b. Small droplet layer (adds small circular droplets in addition to streaks)
                // Create a finer grid for small droplets so they appear as tiny specs
                float dropletSpeedMul = 0.9; // slightly different speed for variety
                float2 dropletUV = float2(uv.x - time * _Wind * 0.6, uv.y + time * dropletSpeedMul);
                float2 dropletGrid = grid * 4.0; // 4x finer than streak grid
                float2 cell = floor(dropletUV * dropletGrid);

                // Per-cell random values (use different seeds via offsets)
                float rndX = Random(cell);
                float rndY = Random(cell + float2(12.34, 45.67));
                float rndSize = Random(cell + float2(78.91, 11.12));
                float rndSpawn = Random(cell + float2(3.0, 7.0));

                // Center of droplet inside the cell (small random offset)
                float2 center = (cell + (float2(rndX, rndY) - 0.5) * 0.6) / dropletGrid;

                // Radius in UV space (scale with grid.x so it's consistent across resolutions)
                float rad = (0.35 + rndSize * 0.65) / dropletGrid.x;

                float dist = distance(uv, center);
                float droplet = 1.0 - smoothstep(rad * 0.6, rad, dist);

                // Control droplet spawn with the same density parameter used for streaks
                float spawn = step(_Density, rndSpawn);
                float maskDroplet = droplet * spawn;

                // Combine streaks + droplets (droplets are blended softly so they don't overpower streaks)
                float finalMask = saturate(combinedMask + maskDroplet * 0.8);

                // 5. Final Composite
                float4 sceneColor = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_BlitTexture, uv);
                // droplets should be a bit less opaque than streaks
                float dropletInfluence = maskDroplet * (_RainColor.a * 0.6);
                float streakInfluence = combinedMask * _RainColor.a;
                float totalInfluence = saturate(streakInfluence + dropletInfluence);

                float3 finalRGB = lerp(sceneColor.rgb, _RainColor.rgb, totalInfluence);

                return float4(finalRGB, sceneColor.a);
            }
            ENDHLSL
        }
    }
}