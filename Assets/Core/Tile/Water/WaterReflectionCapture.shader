Shader "Hidden/UrdewValley/Water Reflection Capture"
{
    Properties
    {
        [PerRendererData] _MainTex ("Sprite", 2D) = "white" {}
        [PerRendererData] _WaterReflectionGroundY ("Ground Y", Float) = 0
    }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Transparent" }
        Blend One OneMinusSrcAlpha
        Cull Off
        ZWrite Off
        ZTest Always
        Pass
        {
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/Core2D.hlsl"
            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);
            CBUFFER_START(UnityPerMaterial)
                float _WaterReflectionGroundY;
            CBUFFER_END
            float4x4 _WaterReflectionCaptureVP;
            float _WaterReflectionFadeDistance;
            struct Attributes { COMMON_2D_INPUTS half4 color : COLOR; };
            struct Varyings { COMMON_2D_OUTPUTS_SHARED half4 color : COLOR; float height : TEXCOORD1; };
            Varyings Vert(Attributes input)
            {
                Varyings output = (Varyings)0;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
                SetUpSpriteInstanceProperties();
                input.positionOS = UnityFlipSprite(input.positionOS, unity_SpriteProps.xy);
                float3 world = TransformObjectToWorld(input.positionOS);
                output.height = world.y - _WaterReflectionGroundY;
                world.y = 2 * _WaterReflectionGroundY - world.y;
                output.positionCS = mul(_WaterReflectionCaptureVP, float4(world, 1));
                output.uv = input.uv;
                output.color = input.color * unity_SpriteColor;
                return output;
            }
            half4 Frag(Varyings input) : SV_Target
            {
                clip(input.height); // Only the visual above its ground plane reflects below it.
                half4 sprite = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, input.uv) * input.color;
                sprite.a *= saturate(1 - input.height / _WaterReflectionFadeDistance);
                return half4(sprite.rgb * sprite.a, sprite.a);
            }
            ENDHLSL
        }
    }
}
