Shader "Custom/PixelSnow"
{
    Properties
    {
        _SnowColor("Snow Color", Color) = (0.6, 0.7, 0.8, 0.5)
        _Density("Density (0.95 = Light, 0.8 = Heavy)", Range(0.5, 1)) = 0.95
        _Speed("Fall Speed", Float) = 0.5
        _Wind("Wind Direction (X-Axis)", Range(-1, 1)) = 0.2
        _VerticalStretch("Snow Streak Length", Float) = 20.0
        _PixelResolution("Pixel Resolution (Match Game)", Vector) = (320, 180, 0, 0)
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "RenderPipeline" = "UniversalPipeline"}
        LOD 100
        ZWrite Off Cull Off
        
        Pass
        {
            Name "PixelSnowPass"

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
                float2 texcoord   : TEXCOORD0;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            CBUFFER_START(UnityPerMaterial)
                float4 _SnowColor;
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
                float2 uv  = GetFullScreenTriangleTexCoord(input.vertexID);

                output.positionCS = pos;
                output.texcoord   = uv;

                return output;
            }

            // Pseudo-random noise function
            float Random(float2 uv)
            {
                return frac(sin(dot(uv, float2(12.9898, 78.233))) * 43758.5453123);
            }

            half4 Frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);

                float2 uv = input.texcoord;

                // 1. Quantize UVs (The Pixel Art Snap)
                float2 quantizedUV = floor(uv * _PixelResolution.xy) / _PixelResolution.xy;

                // 2. Quantize Time (The Animation Snap)
                // This makes the snow move pixel-by-pixel rather than smoothly sliding
                float qTime = floor(_Time.y * _Speed * _PixelResolution.y) / _PixelResolution.y;

                // 3. Coordinate Setup
                float2 snowUV = quantizedUV;
                
                // Add vertical movement and horizontal wind
                snowUV.y += qTime;
                snowUV.x -= qTime * _Wind;

                // 4. Stretch the Y axis to create streaks
                // We divide ONLY the Y coordinate so the noise stretches vertically
                float2 stretchedUV = float2(snowUV.x, snowUV.y / _VerticalStretch);

                // 5. Generate Noise and Step Mask
                float noiseVal = Random(stretchedUV);
                float snowMask = step(_Density, noiseVal);

                // 6. Sample Original Scene
                float4 sceneColor = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_BlitTexture, uv);

                // 7. Final Output
                // The snow mask is multiplied by the color and added to the scene
                return sceneColor + (snowMask * _SnowColor);
            }
            ENDHLSL
        }
    }
}