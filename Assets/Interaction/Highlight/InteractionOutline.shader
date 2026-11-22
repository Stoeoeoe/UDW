// URP's 2D Sprite-Lit-Default plus a two-ring pixel outline on transparent pixels around the art: a coloured
// ring one art pixel from it and a translucent dark ring outside that, so the outline reads on any background.
// The sprite's quad grows by two art pixels on every side, so art that touches its sprite's edge is outlined
// too; the grown border is empty apart from the outline. InteractionHighlighter sets the sprite's own rect and
// sizes per renderer each frame, so sprites sliced from a sheet never pick up their neighbours.
Shader "UrdewValley/Interaction Outline"
{
    Properties
    {
        _MainTex("Diffuse", 2D) = "white" {}
        _MaskTex("Mask", 2D) = "white" {}
        _NormalMap("Normal Map", 2D) = "bump" {}
        [MaterialToggle] _ZWrite("ZWrite", Float) = 0
        _OutlineColor("Outline Color", Color) = (1, 0.92, 0.55, 1)
        _OutlineShadowColor("Outer Ring Color", Color) = (0, 0, 0, 0.5)

        [HideInInspector] _Color("Tint", Color) = (1,1,1,1)
        [HideInInspector] _RendererColor("RendererColor", Color) = (1,1,1,1)
        [HideInInspector] _AlphaTex("External Alpha", 2D) = "white" {}
        [HideInInspector] _EnableExternalAlpha("Enable External Alpha", Float) = 0
    }

    HLSLINCLUDE
        #define OUTLINE_MATERIAL_PROPERTIES \
            CBUFFER_START(UnityPerMaterial) \
                half4 _Color; \
                half4 _OutlineColor; \
                half4 _OutlineShadowColor; \
            CBUFFER_END \
            float4 _SpriteUVRect; \
            float4 _SpriteLocalRect; \
            float4 _SpriteTexelSize;

        // _SpriteLocalRect: the unflipped sprite's local min (xy) and max (zw). _SpriteTexelSize: one texel in
        // UV (xy) and one art pixel in local units (zw). Moves a full-rect sprite's corner out by two art pixels.
        #define OUTLINE_GROW_QUAD(input) \
            { \
                float2 outward = sign(input.positionOS.xy - (_SpriteLocalRect.xy + _SpriteLocalRect.zw) * 0.5); \
                input.positionOS.xy += outward * 2.0 * _SpriteTexelSize.zw; \
                input.uv += outward * 2.0 * _SpriteTexelSize.xy; \
            }

        // SpriteAlpha: alpha of a texel inside the sprite's own rect; zero outside it.
        // OutlineColor: the ring colour for a transparent pixel one (inner) or two (outer) steps from the art,
        // counted in straight steps; zero alpha elsewhere.
        #define OUTLINE_FUNCTIONS \
            bool InsideSprite(float2 uv) { return all(uv > _SpriteUVRect.xy) && all(uv < _SpriteUVRect.zw); } \
            bool Opaque(float2 uv) \
            { \
                return InsideSprite(uv) && SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, uv).a >= 0.5h; \
            } \
            half4 OutlineColor(float2 uv) \
            { \
                if (Opaque(uv)) return 0; \
                float2 x = float2(_SpriteTexelSize.x, 0); \
                float2 y = float2(0, _SpriteTexelSize.y); \
                if (Opaque(uv + x) || Opaque(uv - x) || Opaque(uv + y) || Opaque(uv - y)) return _OutlineColor; \
                if (Opaque(uv + 2 * x) || Opaque(uv - 2 * x) || Opaque(uv + 2 * y) || Opaque(uv - 2 * y) || \
                    Opaque(uv + x + y) || Opaque(uv + x - y) || Opaque(uv - x + y) || Opaque(uv - x - y)) \
                    return _OutlineShadowColor; \
                return 0; \
            }
    ENDHLSL

    SubShader
    {
        Tags {"Queue" = "Transparent" "RenderType" = "Transparent" "RenderPipeline" = "UniversalPipeline" }

        Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha
        Cull Off
        ZWrite [_ZWrite]

        Pass
        {
            Tags { "LightMode" = "Universal2D" }

            HLSLPROGRAM
            #include "Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/Core2D.hlsl"

            #pragma vertex LitVertex
            #pragma fragment LitFragment

            #include_with_pragmas "Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/ShapeLightShared.hlsl"

            #pragma multi_compile_instancing
            #pragma multi_compile _ DEBUG_DISPLAY
            #pragma multi_compile _ SKINNED_SPRITE

            struct Attributes
            {
                COMMON_2D_INPUTS
                half4 color        : COLOR;
                UNITY_SKINNED_VERTEX_INPUTS
            };

            struct Varyings
            {
                COMMON_2D_LIT_OUTPUTS
                half4 color        : COLOR;
            };

            #include "Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/Lit2DCommon.hlsl"

            OUTLINE_MATERIAL_PROPERTIES
            OUTLINE_FUNCTIONS

            Varyings LitVertex(Attributes input)
            {
                UNITY_SKINNED_VERTEX_COMPUTE(input);
                SetUpSpriteInstanceProperties();
                OUTLINE_GROW_QUAD(input)
                input.positionOS = UnityFlipSprite(input.positionOS, unity_SpriteProps.xy);

                Varyings o = CommonLitVertex(input);
                o.color = input.color * _Color * unity_SpriteColor;
                return o;
            }

            half4 LitFragment(Varyings input) : SV_Target
            {
                // Unlit, so the outline reads the same by day and night; it fades with the sprite.
                half4 ring = OutlineColor(input.uv);
                if (ring.a > 0) return half4(ring.rgb, ring.a * input.color.a);
                if (!InsideSprite(input.uv)) return 0;
                return CommonLitFragment(input, input.color);
            }
            ENDHLSL
        }

        Pass
        {
            Tags { "LightMode" = "NormalsRendering"}

            HLSLPROGRAM
            #include "Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/Core2D.hlsl"

            #pragma vertex NormalsRenderingVertex
            #pragma fragment NormalsRenderingFragment

            #pragma multi_compile_instancing
            #pragma multi_compile _ SKINNED_SPRITE

            struct Attributes
            {
                COMMON_2D_NORMALS_INPUTS
                float4 color        : COLOR;
                UNITY_SKINNED_VERTEX_INPUTS
            };

            struct Varyings
            {
                COMMON_2D_NORMALS_OUTPUTS
                half4   color           : COLOR;
            };

            #include "Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/Normals2DCommon.hlsl"

            OUTLINE_MATERIAL_PROPERTIES

            Varyings NormalsRenderingVertex(Attributes input)
            {
                UNITY_SKINNED_VERTEX_COMPUTE(input);
                SetUpSpriteInstanceProperties();
                input.positionOS = UnityFlipSprite(input.positionOS, unity_SpriteProps.xy);

                Varyings o = CommonNormalsVertex(input);
                o.color = input.color * _Color * unity_SpriteColor;
                return o;
            }

            half4 NormalsRenderingFragment(Varyings input) : SV_Target
            {
                SetUpSpriteInstanceProperties();
                return CommonNormalsFragment(input, input.color);
            }
            ENDHLSL
        }

        Pass
        {
            Tags { "LightMode" = "UniversalForward" "Queue"="Transparent" "RenderType"="Transparent"}

            HLSLPROGRAM
            #include "Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/Core2D.hlsl"

            #pragma vertex UnlitVertex
            #pragma fragment UnlitFragment

            struct Attributes
            {
                COMMON_2D_INPUTS
                half4 color : COLOR;
                UNITY_SKINNED_VERTEX_INPUTS
            };

            struct Varyings
            {
                COMMON_2D_OUTPUTS
                half4 color : COLOR;
            };

            #include "Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/2DCommon.hlsl"

            #pragma multi_compile_instancing
            #pragma multi_compile _ DEBUG_DISPLAY SKINNED_SPRITE

            OUTLINE_MATERIAL_PROPERTIES
            OUTLINE_FUNCTIONS

            Varyings UnlitVertex(Attributes input)
            {
                UNITY_SKINNED_VERTEX_COMPUTE(input);
                SetUpSpriteInstanceProperties();
                OUTLINE_GROW_QUAD(input)
                input.positionOS = UnityFlipSprite(input.positionOS, unity_SpriteProps.xy);

                Varyings o = CommonUnlitVertex(input);
                o.color = input.color * _Color * unity_SpriteColor;
                return o;
            }

            half4 UnlitFragment(Varyings input) : SV_Target
            {
                half4 ring = OutlineColor(input.uv);
                if (ring.a > 0) return half4(ring.rgb, ring.a * input.color.a);
                if (!InsideSprite(input.uv)) return 0;
                return CommonUnlitFragment(input, input.color);
            }
            ENDHLSL
        }
    }
}
