using System;
using MoreMountains.Tools;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;
using UnityEngine.Rendering.RenderGraphModule;
using UnityEngine.Rendering.Universal;

namespace Core.TimeAndWeather.Weather
{
    public class WeatherRendererFeature : ScriptableRendererFeature, MMEventListener<WeatherUpdateEvent>
    {
        /// <summary>
        /// A mask of URP textures that the assigned material will need access to. Requesting unused requirements can degrade
        /// performance unnecessarily as URP might need to run additional rendering passes to generate them.
        /// </summary>
        public ScriptableRenderPassInput requirements = ScriptableRenderPassInput.None;

        /// <summary>
        /// The material used to render the full screen pass (typically based on the Fullscreen Shader Graph target).
        /// This is mainly for testing, as at runtime the material will be instantiated from this one to avoid modifying the original asset.
        /// </summary>
        public Material passMaterial;

        /// <summary>
        /// The material instance used at runtime for rendering the full screen pass.
        /// </summary>
        [NonSerialized] public Material runtimeMaterial;

        /// <summary>
        /// The shader pass index that should be used when rendering the assigned material.
        /// </summary>
        public int passIndex = 0;

        /// <summary>
        /// Specifies if the active camera's depth-stencil buffer should be bound when rendering the full screen pass.
        /// Disabling this will ensure that the material's depth and stencil commands will have no effect (this could also have a slight performance benefit).
        /// </summary>
        public bool bindDepthStencilAttachment = false;

        private FullScreenRenderPass m_FullScreenPass;


        /// <inheritdoc/>
        public override void Create()
        {
            if (Application.isPlaying)
            {
                this.MMEventStartListening();
            }

            m_FullScreenPass = new FullScreenRenderPass(name);
            runtimeMaterial = new Material(Shader.Find("Game/UberWeatherShader"));
        }

        /// <inheritdoc/>
        public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
        {
            if (renderingData.cameraData.cameraType == CameraType.Preview
                || renderingData.cameraData.cameraType == CameraType.Reflection
                || UniversalRenderer.IsOffscreenDepthTexture(ref renderingData.cameraData))
                return;

            if (passMaterial == null || runtimeMaterial == null)
            {
                return;
            }

            if (passIndex < 0 || passIndex >= passMaterial.passCount || passIndex >= runtimeMaterial.passCount)
            {
                Debug.LogWarningFormat(
                    "The full screen feature \"{0}\" will not execute - the pass index is out of bounds for the material.",
                    name);
                return;
            }

            m_FullScreenPass.renderPassEvent = RenderPassEvent.AfterRenderingPostProcessing;
            m_FullScreenPass.ConfigureInput(requirements);
            m_FullScreenPass.SetupMembers(runtimeMaterial, passIndex, true, bindDepthStencilAttachment);

            m_FullScreenPass.requiresIntermediateTexture = true;

            renderer.EnqueuePass(m_FullScreenPass);
        }

        /// <inheritdoc/>
        protected override void Dispose(bool disposing)
        {
            m_FullScreenPass.Dispose();
        }

        private class FullScreenRenderPass : ScriptableRenderPass
        {
            private Material m_Material;
            private int m_PassIndex;
            private bool m_FetchActiveColor;
            private bool m_BindDepthStencilAttachment;
            private RTHandle m_CopiedColor;

            private static MaterialPropertyBlock s_SharedPropertyBlock = new MaterialPropertyBlock();

            public FullScreenRenderPass(string passName)
            {
                profilingSampler = new ProfilingSampler(passName);
            }

            public void SetupMembers(Material material, int passIndex, bool fetchActiveColor,
                bool bindDepthStencilAttachment)
            {
                m_Material = material;
                m_PassIndex = passIndex;
                m_FetchActiveColor = fetchActiveColor;
                m_BindDepthStencilAttachment = bindDepthStencilAttachment;
            }


            internal void ReAllocate(RenderTextureDescriptor desc)
            {
                desc.msaaSamples = 1;
                desc.depthStencilFormat = GraphicsFormat.None;
                RenderingUtils.ReAllocateHandleIfNeeded(ref m_CopiedColor, desc, name: "_FullscreenPassColorCopy");
            }

            public void Dispose()
            {
                m_CopiedColor?.Release();
            }

            private static void ExecuteCopyColorPass(RasterCommandBuffer cmd, RTHandle sourceTexture)
            {
                Blitter.BlitTexture(cmd, sourceTexture, new Vector4(1, 1, 0, 0), 0.0f, false);
            }

            private static void ExecuteMainPass(RasterCommandBuffer cmd, RTHandle sourceTexture, Material material,
                int passIndex)
            {
                s_SharedPropertyBlock.Clear();
                if (sourceTexture != null)
                    s_SharedPropertyBlock.SetTexture(Shader.PropertyToID("_BlitTexture"), sourceTexture);

                // We need to set the "_BlitScaleBias" uniform for user materials with shaders relying on core Blit.hlsl to work
                s_SharedPropertyBlock.SetVector(Shader.PropertyToID("_BlitScaleBias"), new Vector4(1, 1, 0, 0));

                cmd.DrawProcedural(Matrix4x4.identity, material, passIndex, MeshTopology.Triangles, 3, 1,
                    s_SharedPropertyBlock);
            }


            public override void RecordRenderGraph(RenderGraph renderGraph, ContextContainer frameData)
            {
                UniversalResourceData resourcesData = frameData.Get<UniversalResourceData>();
                UniversalCameraData cameraData = frameData.Get<UniversalCameraData>();

                TextureHandle source, destination;

                Debug.Assert(resourcesData.cameraColor.IsValid());

                if (m_FetchActiveColor)
                {
                    var targetDesc = renderGraph.GetTextureDesc(resourcesData.cameraColor);
                    targetDesc.name = "_CameraColorFullScreenPass";
                    targetDesc.clearBuffer = false;

                    source = resourcesData.activeColorTexture;
                    destination = renderGraph.CreateTexture(targetDesc);

                    using (var builder = renderGraph.AddRasterRenderPass<CopyPassData>("Copy Color Full Screen",
                               out var passData, profilingSampler))
                    {
                        passData.inputTexture = source;
                        builder.UseTexture(passData.inputTexture, AccessFlags.Read);

                        builder.SetRenderAttachment(destination, 0, AccessFlags.Write);

                        builder.SetRenderFunc((CopyPassData data, RasterGraphContext rgContext) =>
                        {
                            ExecuteCopyColorPass(rgContext.cmd, data.inputTexture);
                        });
                    }

                    //Swap for next pass;
                    source = destination;
                }
                else
                {
                    source = TextureHandle.nullHandle;
                }

                destination = resourcesData.activeColorTexture;


                using (var builder =
                       renderGraph.AddRasterRenderPass<MainPassData>(passName, out var passData, profilingSampler))
                {
                    passData.material = m_Material;
                    passData.passIndex = m_PassIndex;

                    passData.inputTexture = source;

                    if (passData.inputTexture.IsValid())
                        builder.UseTexture(passData.inputTexture, AccessFlags.Read);

                    bool needsDepth = (input & ScriptableRenderPassInput.Depth) != ScriptableRenderPassInput.None;


                    if (needsDepth)
                    {
                        Debug.Assert(resourcesData.cameraDepthTexture.IsValid());
                        builder.UseTexture(resourcesData.cameraDepthTexture);
                    }

                    builder.SetRenderAttachment(destination, 0, AccessFlags.Write);

                    if (m_BindDepthStencilAttachment)
                        builder.SetRenderAttachmentDepth(resourcesData.activeDepthTexture, AccessFlags.Write);

                    builder.SetRenderFunc((MainPassData data, RasterGraphContext rgContext) =>
                    {
                        ExecuteMainPass(rgContext.cmd, data.inputTexture, data.material, data.passIndex);
                    });
                }
            }

            private class CopyPassData
            {
                internal TextureHandle inputTexture;
            }

            private class MainPassData
            {
                internal Material material;
                internal int passIndex;
                internal TextureHandle inputTexture;
            }
        }

        public void OnMMEvent(WeatherUpdateEvent weatherUpdateEvent)
        {
            runtimeMaterial = weatherUpdateEvent.WeatherData.weatherMaterial;
        }
    }
}