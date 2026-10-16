Shader "UI/Urdew/ScreenWipe"
{
    Properties
    {
        [PerRendererData] _MainTex ("Sprite Texture", 2D) = "white" {}
        _Color ("Tint", Color) = (1,1,1,1)
        _Progress ("Coverage", Range(0,1)) = 1
        [Enum(Mosaic,0,Iris,1)] _Style ("Style", Float) = 0
        _Center ("Iris center in screen coordinates", Vector) = (0.5,0.5,0,0)
        _MaskTex ("Iris silhouette (white = opening)", 2D) = "white" {}
        _UseMask ("Use iris silhouette", Float) = 0
        _TileSize ("Tile size in screen pixels", Float) = 32
        [Enum(Random,0,LeftToRight,1,CenterOut,2)] _Order ("Wipe order", Float) = 0
        _StencilComp ("Stencil Comparison", Float) = 8
        _Stencil ("Stencil ID", Float) = 0
        _StencilOp ("Stencil Operation", Float) = 0
        _StencilWriteMask ("Stencil Write Mask", Float) = 255
        _StencilReadMask ("Stencil Read Mask", Float) = 255
        _ColorMask ("Color Mask", Float) = 15
        [Toggle(UNITY_UI_ALPHACLIP)] _UseUIAlphaClip ("Use Alpha Clip", Float) = 0
    }

    SubShader
    {
        Tags { "Queue"="Transparent" "IgnoreProjector"="True" "RenderType"="Transparent" "CanUseSpriteAtlas"="True" }
        Stencil
        {
            Ref [_Stencil]
            Comp [_StencilComp]
            Pass [_StencilOp]
            ReadMask [_StencilReadMask]
            WriteMask [_StencilWriteMask]
        }
        Cull Off
        Lighting Off
        ZWrite Off
        ZTest [unity_GUIZTestMode]
        Blend SrcAlpha OneMinusSrcAlpha
        ColorMask [_ColorMask]

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_local _ UNITY_UI_CLIP_RECT
            #pragma multi_compile_local _ UNITY_UI_ALPHACLIP
            #include "UnityCG.cginc"
            #include "UnityUI.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                fixed4 color : COLOR;
            };

            struct v2f
            {
                float4 vertex : SV_POSITION;
                fixed4 color : COLOR;
                float4 worldPosition : TEXCOORD0;
                float4 screenPosition : TEXCOORD1;
            };

            fixed4 _Color;
            float4 _ClipRect;
            float _Progress, _TileSize, _Order;
            float _Style, _UseMask;
            float4 _Center;
            sampler2D _MaskTex;

            v2f vert(appdata v)
            {
                v2f o;
                o.worldPosition = v.vertex;
                o.vertex = UnityObjectToClipPos(v.vertex);
                o.screenPosition = ComputeScreenPos(o.vertex);
                o.color = v.color * _Color;
                return o;
            }

            float MosaicCoverage(float2 screenUV)
            {
                // Screen coordinates keep tiles square even when the overlay is stretched.
                float2 grid = screenUV * _ScreenParams.xy / _TileSize;
                float2 cell = floor(grid);
                float2 cellCount = ceil(_ScreenParams.xy / _TileSize);
                float order = frac(sin(dot(cell, float2(12.9898, 78.233))) * 43758.5453);
                if (_Order > 0.5 && _Order < 1.5)
                    order = (cell.x + 0.5) / cellCount.x;
                else if (_Order > 1.5)
                {
                    float2 distanceFromCenter = abs((cell + 0.5) / cellCount - 0.5) * 2.0;
                    order = max(distanceFromCenter.x, distanceFromCenter.y);
                }

                // Each square grows from its center, with staggered start times.
                float growth = saturate((_Progress - order * 0.65) / 0.35);
                float2 distanceInCell = abs(frac(grid) - 0.5) * 2.0;
                return step(max(distanceInCell.x, distanceInCell.y), growth);
            }

            float IrisCoverage(float2 screenUV)
            {
                float2 center = _Center.xy * _ScreenParams.xy;
                float2 offset = screenUV * _ScreenParams.xy - center;
                // Measure in pixels so the opening stays circular on wide screens and off-center subjects.
                float radius = length(max(abs(center), abs(_ScreenParams.xy - center))) * (1.0 - _Progress);
                if (_UseMask < 0.5)
                {
                    float distance = length(offset);
                    return smoothstep(radius - 0.5, radius + 0.5, distance);
                }

                // Give a centered silhouette extra room to start beyond the edges of the screen.
                float2 uv = offset / max(4.0 * radius, 0.001) + 0.5;
                float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
                fixed4 mask = tex2D(_MaskTex, uv);
                return 1.0 - inside * step(0.5, mask.r * mask.a);
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.screenPosition.xy / i.screenPosition.w;
                float coverage = _Style < 0.5 ? MosaicCoverage(screenUV) : IrisCoverage(screenUV);
                if (_Progress <= 0.0) coverage = 0.0;
                if (_Progress >= 1.0) coverage = 1.0;
                fixed4 color = i.color;
                color.a *= coverage;
                #ifdef UNITY_UI_CLIP_RECT
                color.a *= UnityGet2DClipping(i.worldPosition.xy, _ClipRect);
                #endif
                #ifdef UNITY_UI_ALPHACLIP
                clip(color.a - 0.001);
                #endif
                return color;
            }
            ENDCG
        }
    }
}
