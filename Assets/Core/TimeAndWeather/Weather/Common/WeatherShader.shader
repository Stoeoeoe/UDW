Shader "Game/UberWeatherShader"
{
    Properties
    {
        _NoiseTex ("Noise Texture", 2D) = "white" {}
        
        [Header(General Settings)]
        _PixelSnap ("Pixel Snap Mode", Float) = 1
        _InternalResX ("Internal Resolution X", Float) = 360
        _InternalResY ("Internal Resolution Y", Float) = 240
        
        [Header(Rain Settings)]
        [Toggle] _RainEnabled ("Rain Enabled", Float) = 0
        _RainStreakDensity ("Rain Streak Density", Range(0, 500)) = 50
        _RainStreakLength ("Rain Streak Length", Range(0.01, 0.2)) = 0.08
        _RainStreakWidth ("Rain Streak Width", Range(0.0001, 0.01)) = 0.001
        _RainStreakSpeed ("Rain Streak Speed", Range(0, 10)) = 3
        _RainStreakColor ("Rain Streak Color", Color) = (0.7, 0.8, 0.9, 0.6)
        _RainStreakFade ("Rain Streak Fade", Range(0, 1)) = 0
        
        _RainDropletDensity ("Rain Droplet Density", Range(0, 1000)) = 100
        _RainDropletSize ("Rain Droplet Size", Range(0.0001, 0.01)) = 0.004
        _RainDropletSpeed ("Rain Droplet Speed", Range(0, 10)) = 5
        _RainDropletColor ("Rain Droplet Color", Color) = (0.8, 0.85, 0.95, 0.4)
        _RainDropletFade ("Rain Droplet Fade", Range(0, 1)) = 0
        
        _RainWindDirection ("Rain Wind Direction", Range(-1, 1)) = 0.2
        _RainWindVariation ("Rain Wind Variation", Range(0, 1)) = 0.1
        
        [Header(Snow Settings)]
        [Toggle] _SnowEnabled ("Snow Enabled", Float) = 0
        _SnowHeavyDensity ("Heavy Snow Density", Range(0, 500)) = 50
        _SnowHeavySize ("Heavy Snow Size", Range(0.001, 0.02)) = 0.008
        _SnowHeavySpeed ("Heavy Snow Speed", Range(0, 3)) = 0.8
        _SnowHeavyColor ("Heavy Snow Color", Color) = (1, 1, 1, 0.9)
        
        _SnowLightDensity ("Light Snow Density", Range(0, 1000)) = 200
        _SnowLightSize ("Light Snow Size", Range(0.0001, 0.01)) = 0.003
        _SnowLightSpeed ("Light Snow Speed", Range(0, 3)) = 0.5
        _SnowLightColor ("Light Snow Color", Color) = (1, 1, 1, 0.6)
        
        _SnowWindDirection ("Snow Wind Direction", Range(-0.5, 0.5)) = 0.1
        _SnowWindVariation ("Snow Wind Variation", Range(0, 1)) = 0.2
        _SnowSwayAmount ("Snow Sway Amount", Range(0, 1)) = 0.3
        _SnowSwaySpeed ("Snow Sway Speed", Range(0, 5)) = 1.5
        
        [Header(Dust Storm Settings)]
        [Toggle] _DustEnabled ("Dust Storm Enabled", Float) = 0
        _DustDensity ("Dust Density", Range(0, 5)) = 1.5
        _DustSpeed ("Dust Speed", Range(0, 5)) = 2
        _DustDirection ("Dust Direction", Range(-1, 1)) = 0.7
        _DustColor ("Dust Color", Color) = (0.8, 0.7, 0.5, 0.3)
        _DustLayerCount ("Dust Layer Count", Range(1, 5)) = 3
        _DustWaveAmount ("Dust Wave Amount", Range(0, 2)) = 0.5
        _DustWaveSpeed ("Dust Wave Speed", Range(0, 5)) = 1.2

        [Header(Cloud Settings)]
        [Toggle] _CloudEnabled ("Clouds Enabled", Float) = 0
        _CloudTex ("Cloud Texture", 2D) = "white" {}
        _CloudColor ("Cloud Color", Color) = (1, 1, 1, 0.7)
        _CloudDirection ("Cloud Direction", Vector) = (1, 0, 0, 0)
        _CloudSpeed ("Cloud Speed", Range(-2, 2)) = 0.2
        _CloudOpacity ("Cloud Opacity", Range(0, 1)) = 0.7
        _CloudDistortStrength ("Cloud Distort Strength", Range(0, 0.2)) = 0.05
        _CloudSize ("Cloud Size", Range(0.1, 10)) = 1.0
        _CloudWorldScale ("Cloud World Scale", Range(1, 1000)) = 300.0
    }
    
    SubShader
    {
        Tags 
        { 
            "RenderType"="Opaque" 
            "RenderPipeline" = "UniversalPipeline"
        }
        LOD 100
        ZWrite Off 
        Cull Off

        Pass
        {
            Name "UberWeatherPass"

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.core/ShaderLibrary/Common.hlsl"

            struct Attributes
            {
                uint vertexID : SV_VertexID;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 texcoord : TEXCOORD0;
                float4 screenPos : TEXCOORD1;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            TEXTURE2D_X(_BlitTexture);
            SAMPLER(sampler_BlitTexture);
            
            TEXTURE2D(_NoiseTex);
            SAMPLER(sampler_NoiseTex);
            TEXTURE2D(_CloudTex);
            SAMPLER(sampler_CloudTex);
            
            CBUFFER_START(UnityPerMaterial)
                float _PixelSnap;
                float _InternalResX;
                float _InternalResY;
                
                // Rain
                float _RainEnabled;
                float _RainStreakDensity;
                float _RainStreakLength;
                float _RainStreakWidth;
                float _RainStreakSpeed;
                float4 _RainStreakColor;
                float _RainStreakFade;
                float _RainDropletDensity;
                float _RainDropletSize;
                float _RainDropletSpeed;
                float4 _RainDropletColor;
                float _RainDropletFade;
                float _RainWindDirection;
                float _RainWindVariation;
                
                // Snow
                float _SnowEnabled;
                float _SnowHeavyDensity;
                float _SnowHeavySize;
                float _SnowHeavySpeed;
                float4 _SnowHeavyColor;
                float _SnowLightDensity;
                float _SnowLightSize;
                float _SnowLightSpeed;
                float4 _SnowLightColor;
                float _SnowWindDirection;
                float _SnowWindVariation;
                float _SnowSwayAmount;
                float _SnowSwaySpeed;
                
                // Dust
                float _DustEnabled;
                float _DustDensity;
                float _DustSpeed;
                float _DustDirection;
                float4 _DustColor;
                float _DustLayerCount;
                float _DustWaveAmount;
                float _DustWaveSpeed;

                // Clouds
                float _CloudEnabled;
                float4 _CloudColor;
                float _CloudSpeed;
                float2 _CloudDirection;
                float _CloudOpacity;
                float _CloudDistortStrength;
                float _CloudSize;
                float _CloudWorldScale;
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
                output.screenPos = pos;

                return output;
            }

            // Hash function for randomization
            float Hash(float2 p)
            {
                return frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453123);
            }
            
            float Hash13(float3 p3)
            {
                p3 = frac(p3 * 0.1031);
                p3 += dot(p3, p3.zyx + 31.32);
                return frac((p3.x + p3.y) * p3.z);
            }
            
            float2 Hash22(float2 p)
            {
                float3 p3 = frac(float3(p.xyx) * float3(0.1031, 0.1030, 0.0973));
                p3 += dot(p3, p3.yzx + 33.33);
                return frac((p3.xx + p3.yz) * p3.zy);
            }

            float2 PixelSnap(float2 uv)
            {
                if (_PixelSnap > 0.5)
                {
                    float2 pixelCoord = uv * float2(_InternalResX, _InternalResY);
                    pixelCoord = floor(pixelCoord) + 0.5;
                    return pixelCoord / float2(_InternalResX, _InternalResY);
                }
                return uv;
            }

            // Rain streak rendering
            float RainStreak(float2 uv, float time)
            {
                float result = 0.0;
                
                // Create a denser pattern by using screen-space directly
                float2 rainUV = float2(uv.x + uv.y * _RainWindDirection, uv.y + time * _RainStreakSpeed);
                
                // Multiple layers for density
                for (int layer = 0; layer < 3; layer++)
                {
                    float layerOffset = float(layer) * 123.456;
                    float2 layerUV = rainUV * _RainStreakDensity + layerOffset;
                    float2 cellId = floor(layerUV);
                    float2 cellUv = frac(layerUV);
                    
                    float random = Hash(cellId);
                    float windVar = Hash(cellId + 100.0) * _RainWindVariation;
                    
                    // Position streak in cell
                    float streakX = random;
                    float streakY = frac(Hash(cellId + 50.0) * 10.0);
                    
                    float2 toStreak = cellUv - float2(streakX, streakY);
                    toStreak.x -= toStreak.y * windVar;
                    
                    // Make streaks much more visible with adjusted falloff
                    float verticalMask = 1.0 - saturate(abs(toStreak.y) / (_RainStreakLength * 5.0));
                    float horizontalMask = 1.0 - saturate(abs(toStreak.x) / (_RainStreakWidth * 50.0));
                    
                    float streakMask = verticalMask * horizontalMask;
                    streakMask = pow(streakMask, 2.0); // Sharpen the streak
                    streakMask *= (1.0 - _RainStreakFade);
                    
                    result += streakMask;
                }
                
                return saturate(result);
            }

            // Rain droplet rendering
            float RainDroplet(float2 uv, float time)
            {
                float result = 0.0;
                
                // Create a denser droplet pattern
                float2 dropletUV = float2(uv.x, uv.y + time * _RainDropletSpeed * 0.5);
                
                // Multiple layers for better coverage
                for (int layer = 0; layer < 2; layer++)
                {
                    float layerOffset = float(layer) * 456.789;
                    float2 layerUV = dropletUV * _RainDropletDensity + layerOffset;
                    float2 cellId = floor(layerUV);
                    float2 cellUv = frac(layerUV);
                    
                    // Check neighboring cells for better coverage
                    for (int y = -1; y <= 1; y++)
                    {
                        for (int x = -1; x <= 1; x++)
                        {
                            float2 offset = float2(x, y);
                            float2 neighborId = cellId + offset;
                            float2 neighborUv = cellUv - offset;
                            
                            float2 random = Hash22(neighborId);
                            
                            // Droplet position with some randomization
                            float2 dropletPos = random;
                            float2 diff = neighborUv - dropletPos;
                            
                            float dist = length(diff);
                            float size = _RainDropletSize * 100.0; // Scale up the size
                            
                            // Softer falloff for better visibility
                            float dropletMask = 1.0 - saturate(dist / size);
                            dropletMask = pow(dropletMask, 3.0); // Sharpen droplet edges
                            dropletMask *= (1.0 - _RainDropletFade);
                            
                            result += dropletMask;
                        }
                    }
                }
                
                return saturate(result * 0.5); // Scale down combined result
            }

            // Snow particle rendering
            float SnowParticles(float2 uv, float time, float density, float size, float speed, out float layerDepth)
            {
                float result = 0.0;
                layerDepth = 0.0;
                float2 cellSize = 1.0 / density;
                float2 cellId = floor(uv / cellSize);
                float2 cellUv = frac(uv / cellSize);
                
                for (int y = -1; y <= 1; y++)
                {
                    for (int x = -1; x <= 1; x++)
                    {
                        float2 offset = float2(x, y);
                        float2 neighborId = cellId + offset;
                        float2 neighborUv = cellUv - offset;
                        
                        float2 random = Hash22(neighborId);
                        float timeOffset = Hash(neighborId + 300.0) * 20.0;
                        float particleTime = time * speed + timeOffset;
                        
                        float windOffset = Hash(neighborId + 400.0) * _SnowWindVariation;
                        float windDir = _SnowWindDirection + windOffset;
                        
                        float swayPhase = particleTime * _SnowSwaySpeed + random.x * 6.28;
                        float sway = sin(swayPhase) * _SnowSwayAmount * 0.1;
                        
                        float yPos = frac(particleTime);
                        float xPos = random.x + yPos * windDir + sway;
                        
                        float2 particlePos = float2(frac(xPos), yPos);
                        float2 diff = neighborUv - particlePos;
                        
                        float dist = length(diff);
                        float particleMask = smoothstep(size, size * 0.3, dist);
                        
                        result += particleMask;
                        layerDepth += particleMask * (1.0 - yPos);
                    }
                }
                
                return saturate(result);
            }

            // Dust storm rendering
            float DustStorm(float2 uv, float time)
            {
                float result = 0.0;
                
                for (int layer = 0; layer < (int)_DustLayerCount; layer++)
                {
                    float layerSpeed = 1.0 + float(layer) * 0.3;
                    float layerScale = 1.0 + float(layer) * 0.5;
                    
                    float2 scrollUv = uv * layerScale;
                    scrollUv.x += time * _DustSpeed * layerSpeed * _DustDirection;
                    scrollUv.y += sin(time * _DustWaveSpeed + float(layer)) * _DustWaveAmount * 0.1;
                    
                    float noise1 = SAMPLE_TEXTURE2D(_NoiseTex, sampler_NoiseTex, scrollUv * 2.0).r;
                    float noise2 = SAMPLE_TEXTURE2D(_NoiseTex, sampler_NoiseTex, scrollUv * 4.0 + float2(100.0, 100.0)).r;
                    
                    float layerDust = noise1 * 0.7 + noise2 * 0.3;
                    layerDust = pow(layerDust, 2.0) * _DustDensity;
                    
                    result += layerDust / (float(layer) + 1.0);
                }
                
                return saturate(result / _DustLayerCount);
            }

            // Helper: get world position from screen UV (planar mapping at y=0)
            float2 GetWorldCloudUV(float2 uv)
            {
                float3 camPos = _WorldSpaceCameraPos;
                float2 worldUV = camPos.xz + (uv - 0.5) * _CloudWorldScale;
                return worldUV;
            }

            // Cloud rendering
            float CloudLayer(float2 uv, float time, float speed, float opacity, float distortStrength, float2 direction, float size)
            {
                // Use world position for UVs
                float2 worldUV = GetWorldCloudUV(uv);
                // Animate cloud offset with direction
                float2 cloudOffset = time * speed * direction;
                // Distort UVs with noise
                float2 noiseUV = worldUV * 2.0 + time * 0.1;
                float2 noise = SAMPLE_TEXTURE2D(_NoiseTex, sampler_NoiseTex, noiseUV).rg * 2.0 - 1.0;
                float2 distortedUV = worldUV + noise * distortStrength;
                // Scale UVs for cloud size/tiling
                float2 scaledUV = distortedUV * size;
                // Tile the cloud texture seamlessly
                float2 tiledUV = frac(scaledUV + cloudOffset);
                float cloud = SAMPLE_TEXTURE2D(_CloudTex, sampler_CloudTex, tiledUV).r;
                return cloud * opacity;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
                
                float2 uv = PixelSnap(input.texcoord);
                float4 col = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_BlitTexture, input.texcoord);
                float time = _Time.y;
                
                float4 weatherColor = float4(0, 0, 0, 0);
                
                // Rain rendering
                if (_RainEnabled > 0.5)
                {
                    float streak = RainStreak(uv, time);
                    float droplet = RainDroplet(uv, time);
                    
                    weatherColor.rgb += _RainStreakColor.rgb * streak * _RainStreakColor.a;
                    weatherColor.a += streak * _RainStreakColor.a;
                    
                    weatherColor.rgb += _RainDropletColor.rgb * droplet * _RainDropletColor.a;
                    weatherColor.a += droplet * _RainDropletColor.a;
                }
                
                // Snow rendering
                if (_SnowEnabled > 0.5)
                {
                    float heavyDepth, lightDepth;
                    float heavy = SnowParticles(uv, time, _SnowHeavyDensity, _SnowHeavySize, _SnowHeavySpeed, heavyDepth);
                    float light = SnowParticles(uv, time * 1.2, _SnowLightDensity, _SnowLightSize, _SnowLightSpeed, lightDepth);
                    
                    weatherColor.rgb += _SnowHeavyColor.rgb * heavy * _SnowHeavyColor.a;
                    weatherColor.a += heavy * _SnowHeavyColor.a;
                    
                    weatherColor.rgb += _SnowLightColor.rgb * light * _SnowLightColor.a;
                    weatherColor.a += light * _SnowLightColor.a;
                }
                
                // Dust storm rendering
                if (_DustEnabled > 0.5)
                {
                    float dust = DustStorm(uv, time);
                    weatherColor.rgb += _DustColor.rgb * dust * _DustColor.a;
                    weatherColor.a += dust * _DustColor.a;
                }
                
                // Cloud rendering
                if (_CloudEnabled > 0.5)
                {
                    float cloud = CloudLayer(input.texcoord, time, _CloudSpeed, _CloudOpacity, _CloudDistortStrength, _CloudDirection.xy, _CloudSize);
                    weatherColor.rgb += _CloudColor.rgb * cloud * _CloudColor.a;
                    weatherColor.a += cloud * _CloudColor.a; 
                }
                
                // Blend weather effects
                weatherColor.a = saturate(weatherColor.a);
                col.rgb = lerp(col.rgb, weatherColor.rgb, weatherColor.a);
                
                return col;
            }
            ENDHLSL
        }
    }
}