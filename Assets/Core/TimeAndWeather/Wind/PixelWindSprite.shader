Shader "UrdewValley/Pixel Wind Simple"
{
    Properties
    {
        _MainTex ("Sprite Texture", 2D) = "white" {}
        _Color ("Tint", Color) = (1,1,1,1)
        
        [Header(Pixel Snapping)]
        _PixelsPerUnit ("Pixels Per Unit", Float) = 16.0
        
        [Header(Wind Burst and Quietness)]
        _WindSpeed ("Sway Speed during Gust", Range(0, 10)) = 3.0
        _GustInterval ("Gust Interval", Range(1.0, 15.0)) = 5.0
        _GustChance ("Gust Chance", Range(0.0, 1.0)) = 0.4
        _WindMaxPixels ("Max Horizontal Pixel Shift", Range(0, 4)) = 1.0
        _SpatialVariance ("Spatial Offset Variance", Range(0, 10)) = 2.0
        
        [Header(Bending and Stiffness)]
        _StiffnessPower ("Stiffness Curve", Range(0.5, 5.0)) = 3.0
        _RootThreshold ("Root Pinning", Range(0.0, 0.8)) = 0.25
    }

    SubShader
    {
        Tags 
        { 
            "RenderType"="Transparent" 
            "Queue"="Transparent" 
            "RenderPipeline"="UniversalPipeline"
            "UniversalMaterialType" = "Unlit"
        }

        Blend SrcAlpha OneMinusSrcAlpha
        Cull Off
        ZWrite Off

        Pass
        {
            Name "Universal2D"
            Tags { "LightMode" = "Universal2D" }

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct appdata
            {
                float4 vertex   : POSITION;
                float2 uv       : TEXCOORD0;
                float4 color    : COLOR;
            };

            struct v2f
            {
                float4 pos      : SV_POSITION;
                float2 uv       : TEXCOORD0;
                float4 color    : COLOR;
            };

            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);

            float4 _MainTex_ST;
            float4 _Color;

            float _PixelsPerUnit;
            float _WindSpeed;
            float _GustInterval;
            float _GustChance;
            float _WindMaxPixels;
            float _SpatialVariance;
            float _StiffnessPower;
            float _RootThreshold;

            float Hash1D(float p)
            {
                p = frac(p * 0.1031);
                p *= p + 33.33;
                p *= p + p;
                return frac(p);
            }

            v2f vert (appdata v)
            {
                v2f o;
                
                float normalizedHeight = saturate(v.uv.y * 2.0);
                float heightFactor = saturate((normalizedHeight - _RootThreshold) / (1.0 - _RootThreshold));
                heightFactor = pow(heightFactor, _StiffnessPower);

                float3 worldPos = TransformObjectToWorld(v.vertex.xyz);
                float spatialOffset = (worldPos.x * 0.7 + worldPos.y * 0.3) * _SpatialVariance;

                float timeWindow = _Time.y / _GustInterval + spatialOffset;
                float windowId = floor(timeWindow);
                float windowPhase = frac(timeWindow);

                float randomVal = Hash1D(windowId);
                float isGusting = step(randomVal, _GustChance);

                float gustEnvelope = smoothstep(0.0, 0.15, windowPhase) * smoothstep(0.5, 0.25, windowPhase) * isGusting;
                float rawWave = sin(_Time.y * _WindSpeed + spatialOffset) * gustEnvelope;

                float horizontalPixelOffset = floor(rawWave * (_WindMaxPixels + 0.49));

                float texelSize = 1.0 / _PixelsPerUnit;
                v.vertex.x += (horizontalPixelOffset * texelSize) * heightFactor;

                o.pos = TransformObjectToHClip(v.vertex.xyz);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.color = v.color * _Color;

                return o;
            }

            float4 frag (v2f i) : SV_Target
            {
                float4 texCol = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv) * i.color;
                clip(texCol.a - 0.01);
                return texCol;
            }
            ENDHLSL
        }
    }
}