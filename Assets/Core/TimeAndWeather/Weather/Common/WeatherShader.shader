Shader "Game/UberWeatherShader"
{
    Properties
    {
        _NoiseTex ("Noise Texture", 2D) = "white" {}
        
        [Header(General Settings)]
        _PixelSnap ("Pixel Snap Mode", Float) = 1
        _InternalResX ("Internal Resolution X", Float) = 360
        _InternalResY ("Internal Resolution Y", Float) = 240
        _PixelsPerUnit ("Pixels Per Unit", Float) = 16
        [Toggle] _WeatherAutoResolution ("Art Pixel Grid From Camera Size And PPU", Float) = 1
        [Toggle] _WeatherWorldAnchored ("Anchor Rain And Snow To World", Float) = 1
        
        [Header(Rain Settings)]
        [Toggle] _RainEnabled ("Rain Enabled", Float) = 0
        _RainDensity ("Rain Density", Range(0, 1)) = 0.25
        _RainSpeed ("Fall Speed (art pixels per second)", Range(50, 800)) = 280
        _RainFallTime ("Visible Fall Time (seconds)", Range(0.05, 0.6)) = 0.15
        _RainStreakLength ("Streak Length (art pixels)", Range(2, 32)) = 10
        _RainStreakWidth ("Streak Width (art pixels)", Range(0.1, 1)) = 0.35
        _RainWind ("Wind (sideways per unit down)", Range(-1, 1)) = 0.25
        [Toggle] _RainSnapStreaks ("Snap Streaks To Art Pixels", Float) = 0
        _RainFps ("Splash Frames Per Second", Range(4, 60)) = 24
        _RainStreakColor ("Rain Color (alpha = opacity)", Color) = (0.75, 0.82, 0.92, 0.55)
        _RainSceneLit ("Rain Follows Scene Brightness", Range(0, 1)) = 0.6
        [Toggle] _RainSplashes ("Ground Splashes", Float) = 1
        _RainFarLayer ("Background Layer Density", Range(0, 1)) = 0.5
        _RainOvercast ("Overcast Darkening", Range(0, 0.5)) = 0.12
        
        [Header(Snow Settings)]
        [Toggle] _SnowEnabled ("Snow Enabled", Float) = 0
        _SnowDensity ("Snow Density", Range(0, 1)) = 0.15
        _SnowSpeed ("Fall Speed (art pixels per second)", Range(2, 80)) = 14
        _SnowWind ("Wind (sideways per unit down)", Range(-1, 1)) = 0.1
        _SnowGust ("Gust Amplitude (art pixels)", Range(0, 40)) = 0
        _SnowSway ("Sway (art pixels)", Range(0, 3)) = 1.5
        _SnowSwaySpeed ("Sway Speed", Range(0, 5)) = 1
        [Toggle] _SnowNearLarge ("Large Near Flakes", Float) = 0
        _SnowMidLayer ("Middle Layer Density", Range(0, 1)) = 0.6
        _SnowFarLayer ("Background Layer Density", Range(0, 1)) = 0.5
        _SnowLifetime ("Flake Lifetime (seconds)", Range(0.5, 10)) = 5
        _SnowColor ("Snow Color (alpha = opacity)", Color) = (0.95, 0.97, 1, 0.85)
        _SnowSceneLit ("Snow Follows Scene Brightness", Range(0, 1)) = 0.5
        _SnowHaze ("Snow Haze", Range(0, 0.4)) = 0.02
        [Toggle] _SnowSnap ("Snap Flakes To Art Pixels", Float) = 0
        
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
            #pragma target 3.5
            
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
            // Global presentation value: weather changes under a cutscene cover stay hidden.
            // Zero is normal weather, so scenes without a cutscene need no initialization.
            float _CutsceneWeatherCover;
            float _IndoorWeatherCover;
            
            TEXTURE2D(_NoiseTex);
            SAMPLER(sampler_NoiseTex);
            TEXTURE2D(_CloudTex);
            SAMPLER(sampler_CloudTex);
            
            CBUFFER_START(UnityPerMaterial)
                float _PixelSnap;
                float _InternalResX;
                float _InternalResY;
                float _PixelsPerUnit;
                float _WeatherAutoResolution;
                float _WeatherWorldAnchored;
                
                // Rain
                float _RainEnabled;
                float _RainDensity;
                float _RainSpeed;
                float _RainFallTime;
                float _RainStreakLength;
                float _RainStreakWidth;
                float _RainWind;
                float _RainSnapStreaks;
                float _RainFps;
                float4 _RainStreakColor;
                float _RainSceneLit;
                float _RainSplashes;
                float _RainFarLayer;
                float _RainOvercast;
                
                // Snow
                float _SnowEnabled;
                float _SnowDensity;
                float _SnowSpeed;
                float _SnowWind;
                float _SnowGust;
                float _SnowSway;
                float _SnowSwaySpeed;
                float _SnowNearLarge;
                float _SnowMidLayer;
                float _SnowFarLayer;
                float _SnowLifetime;
                float4 _SnowColor;
                float _SnowSceneLit;
                float _SnowHaze;
                float _SnowSnap;
                
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

            // ---- Rain -----------------------------------------------------------------------
            // Streaks are in the air, so they move smoothly at screen resolution: thin, crisp,
            // fading along the tail. Splashes touch the ground, so they stay on the art-pixel grid
            // and animate in whole frames. Positions are in art pixels, optionally world anchored.

            int FloorDiv(int a, int b) { return (a - (a < 0 ? b - 1 : 0)) / b; }

            uint Pcg(uint v)
            {
                uint state = v * 747796405u + 2891336453u;
                uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
                return (word >> 22u) ^ word;
            }

            float RainRand(int2 cell, uint salt)
            {
                uint h = Pcg(Pcg(asuint(cell.x) ^ (salt * 0x9E3779B9u)) + asuint(cell.y));
                return float(h) * (1.0 / 4294967296.0);
            }

            // Visible area in art pixels. Auto uses the orthographic camera size, so art pixels are
            // square and match the camera's real aspect ratio.
            float2 RainResolution()
            {
                return _WeatherAutoResolution > 0.5 && unity_OrthoParams.w > 0.5
                    ? round(unity_OrthoParams.xy * 2 * _PixelsPerUnit)
                    : float2(_InternalResX, _InternalResY);
            }

            // Continuous position in art pixels. World anchoring keeps splashes fixed to the ground.
            float2 RainPosition(float2 uv, float2 resolution)
            {
                float2 position = uv * resolution;
                if (_WeatherWorldAnchored > 0.5)
                    position += _WorldSpaceCameraPos.xy * _PixelsPerUnit - resolution * 0.5;
                return position;
            }

            // Returns relative opacity in [0,1] for one layer of drops.
            float RainLayer(float2 q, float time, uint salt, float density, float speed, float length,
                float width, bool splashes, float screenPerArt)
            {
                if (density <= 0) return 0;
                const float cellWidth = 10;
                bool snap = _RainSnapStreaks > 0.5;
                float fallTime = max(_RainFallTime, 0.01);
                float splashTime = 2 / _RainFps;
                float period = fallTime + splashTime + 0.25;
                float height = ceil(speed * fallTime + length + 4); // A drop never spans more than two cell rows.
                float t = snap ? floor(time * _RainFps) / _RainFps : time;
                float2 s = snap ? floor(q) + 0.5 : q;
                // Shear so every drop path is a vertical column. Snapped mode keeps one-pixel stair steps.
                float sx = snap ? floor(q.x) + floor(floor(q.y) * _RainWind) + 0.5 : q.x + q.y * _RainWind;
                float column = floor(sx / cellWidth);
                float lx = sx - column * cellWidth;
                float row = floor(s.y / height);
                float result = 0;
                for (int k = 0; k < 2; k++)
                {
                    int2 cell = int2(column, row - k); // Drops landing here or in the row below.
                    float shifted = t + RainRand(cell, salt) * period;
                    float cycle = floor(shifted / period);
                    float age = shifted - cycle * period;
                    int2 seed = cell + int2(cycle, cycle) * int2(7, 13); // New position and chance every cycle.
                    if (RainRand(seed, salt + 1u) >= density) continue;
                    float dropX = 3 + RainRand(seed, salt + 2u) * (cellWidth - 6); // Margin keeps splashes in the column.
                    float landY = (row - k) * height + 1 + floor(RainRand(seed, salt + 3u) * (height - 2));
                    if (age < fallTime)
                    {
                        float dy = s.y - (landY + (fallTime - age) * speed);
                        if (dy < 0 || dy > length) continue;
                        if (snap)
                        {
                            if (abs(lx - (floor(dropX) + 0.5)) < 0.5) result = max(result, dy < 1 ? 1 : 0.6);
                        }
                        else
                        {
                            // One screen pixel of edge coverage keeps thin lines crisp but stable.
                            float coverage = saturate((width * 0.5 - abs(lx - dropX)) * screenPerArt + 0.5);
                            result = max(result, coverage * lerp(1, 0.2, dy / length));
                        }
                    }
                    else if (splashes && age < fallTime + splashTime)
                    {
                        int frame = int((age - fallTime) * _RainFps);
                        int2 d = int2(floor(q)) - int2(floor(column * cellWidth + dropX - landY * _RainWind), landY);
                        bool hit = frame == 0 ? (all(d == 0) || (d.y == 1 && abs(d.x) == 1))
                                              : (d.y == 0 && abs(d.x) == 2);
                        if (hit) result = max(result, 0.6);
                    }
                }
                return result;
            }

            float3 ApplyRain(float3 color, float2 uv)
            {
                color *= 1 - _RainOvercast;
                float2 resolution = RainResolution();
                float2 q = RainPosition(uv, resolution);
                float screenPerArt = _ScreenParams.y / resolution.y;
                float time = _Time.y;
                float near = RainLayer(q, time, 101u, _RainDensity, _RainSpeed, _RainStreakLength,
                    _RainStreakWidth, _RainSplashes > 0.5, screenPerArt);
                // The background layer is slower, shorter, thinner and fainter for a little depth.
                float far = RainLayer(q, time, 211u, _RainDensity * _RainFarLayer, _RainSpeed * 0.8,
                    _RainStreakLength * 0.6, _RainStreakWidth * 0.7, false, screenPerArt);
                float opacity = max(near, far * 0.5) * _RainStreakColor.a;
                if (opacity <= 0) return color;
                // Rain picks up the scene's lighting, so it stays dim at night instead of glowing.
                float brightness = saturate(dot(color, float3(0.299, 0.587, 0.114)) * 2.5);
                float3 rain = _RainStreakColor.rgb * lerp(1, brightness, _RainSceneLit);
                return lerp(color, rain, opacity);
            }

            // ---- Snow -----------------------------------------------------------------------
            // Flakes are art-pixel blocks (a dot, or a plus for large near flakes) that drift
            // smoothly, so they match the art's pixel size without stepping. Three layers give depth.
            // Each flake lives for a while, then fades out in two steps while a new one appears.

            // Returns relative opacity in [0,1] for one layer of flakes.
            float SnowLayer(float2 q, float time, uint salt, float density, float cellSize, float speed,
                float sway, bool large, bool snap)
            {
                if (density <= 0) return 0;
                sway = min(sway, cellSize * 0.5 - 4);
                // Wind plus slow gusts. The gust term is an integrated sine, so flakes never jump.
                float drift = _SnowWind * speed * time + _SnowGust * (1 - cos(time * 0.6));
                float2 moving = float2(q.x - drift, q.y);
                float column = floor(moving.x / cellSize);
                // Each column falls at its own speed, so flakes do not move as one rigid sheet.
                moving.y += speed * lerp(0.75, 1.25, RainRand(int2(column, 0), salt)) * time;
                float row = floor(moving.y / cellSize);
                int2 cell = int2(column, row);
                float2 local = moving - float2(column, row) * cellSize;

                float phase = time / max(_SnowLifetime, 0.5) + RainRand(cell, salt + 1u);
                float cycle = floor(phase);
                float age = phase - cycle;
                int2 seed = cell + int2(cycle, cycle) * int2(7, 13);
                if (RainRand(seed, salt + 2u) >= density) return 0;

                float margin = sway + 2; // Keeps the flake and its sway inside the cell.
                float2 flake = margin + float2(RainRand(seed, salt + 3u), RainRand(seed, salt + 4u)) * (cellSize - 2 * margin);
                flake.x += sin(time * _SnowSwaySpeed + RainRand(seed, salt + 5u) * 6.2832) * sway;
                float2 d = local - flake;
                if (snap)
                {
                    // Snap the flake's screen position, not the moving cell space.
                    float2 flakeQ = q - local + flake;
                    d = floor(q) - floor(flakeQ);
                }
                float2 a = abs(d);
                float coverage = all(a < 0.5) ? 1 :
                    large && ((a.x < 1.5 && a.y < 0.5) || (a.x < 0.5 && a.y < 1.5)) ? 0.6 : 0;
                if (coverage <= 0) return 0;
                return coverage * (age < 0.08 || age > 0.92 ? 0.5 : 1); // Two-step fade instead of popping.
            }

            float3 ApplySnow(float3 color, float2 uv)
            {
                float2 resolution = RainResolution();
                float2 q = RainPosition(uv, resolution);
                float time = _Time.y;
                bool snap = _SnowSnap > 0.5;
                // Snow takes the scene's lighting, so it reads blue-grey at night instead of glowing.
                float brightness = saturate(dot(color, float3(0.299, 0.587, 0.114)) * 2.5);
                float3 snow = _SnowColor.rgb * lerp(1, brightness, _SnowSceneLit);
                color = lerp(color, snow, _SnowHaze); // Heavy snow softens the whole scene.

                float near = SnowLayer(q, time, 301u, _SnowDensity, 24, _SnowSpeed, _SnowSway, _SnowNearLarge > 0.5, snap);
                float mid = SnowLayer(q, time, 401u, _SnowDensity * _SnowMidLayer, 16, _SnowSpeed * 0.7, _SnowSway * 0.7, false, snap);
                float far = SnowLayer(q, time, 503u, _SnowDensity * _SnowFarLayer, 12, _SnowSpeed * 0.45, _SnowSway * 0.5, false, snap);
                float opacity = max(near, max(mid * 0.7, far * 0.4)) * _SnowColor.a;
                return opacity > 0 ? lerp(color, snow, opacity) : color;
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
                float3 sceneColor = col.rgb;
                float time = _Time.y;
                
                // Rain and snow blend against the scene pixel directly, so they are applied before the other layers.
                if (_RainEnabled > 0.5)
                    col.rgb = ApplyRain(col.rgb, input.texcoord);
                if (_SnowEnabled > 0.5)
                    col.rgb = ApplySnow(col.rgb, input.texcoord);
                
                float4 weatherColor = float4(0, 0, 0, 0);
                
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
                col.rgb = lerp(col.rgb, sceneColor, max(_CutsceneWeatherCover, _IndoorWeatherCover));
                
                return col;
            }
            ENDHLSL
        }
    }
}
