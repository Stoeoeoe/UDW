using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;
using UnityEngine.Rendering.RenderGraphModule;
using UnityEngine.Rendering.Universal;
using UnityEngine.Tilemaps;

namespace Core.Tile.Water
{
    /// <summary>Captures registered sprite geometry before water, with a per-sprite ground plane.</summary>
    public sealed class WaterReflectionRendererFeature : ScriptableRendererFeature
    {
        public const string CaptureShaderName = "Hidden/UrdewValley/Water Reflection Capture";
        public Material captureMaterial;
        [Min(0.001f)] public float maximumDistance = 4;
        private CapturePass capturePass;
        private ReleasePass releasePass;
        private readonly Plane[] planes = new Plane[6];
        private static readonly int TextureId = Shader.PropertyToID("_WaterObjectReflectionTexture");
        private static readonly int AvailableId = Shader.PropertyToID("_WaterObjectReflectionAvailable");
        private static readonly int WorldToClipId = Shader.PropertyToID("_WaterObjectReflectionWorldToClip");
        private static readonly int CaptureVpId = Shader.PropertyToID("_WaterReflectionCaptureVP");
        private static readonly int FadeId = Shader.PropertyToID("_WaterReflectionFadeDistance");
        private static readonly int GroundId = Shader.PropertyToID("_WaterReflectionGroundY");

        public void Validate()
        {
            if (!captureMaterial || !captureMaterial.shader || captureMaterial.shader.name != CaptureShaderName)
                throw new InvalidOperationException($"Water reflections require a capture material using '{CaptureShaderName}'.");
            if (!float.IsFinite(maximumDistance) || maximumDistance <= 0)
                throw new InvalidOperationException("Water reflection maximum distance must be positive and finite.");
        }

        public override void Create()
        {
            capturePass = new CapturePass(this) { renderPassEvent = RenderPassEvent.BeforeRenderingTransparents };
            releasePass = new ReleasePass { renderPassEvent = RenderPassEvent.BeforeRenderingPostProcessing };
        }

        public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
        {
            var camera = renderingData.cameraData.camera;
            GeometryUtility.CalculateFrustumPlanes(camera, planes);
            foreach (var body in WaterBody.ActiveBodies)
            {
                if (!body.Profile.objectReflectionsEnabled || body.Profile.objectReflectionOpacity == 0) continue;
                var surface = body.GetComponent<TilemapRenderer>();
                if (!surface.enabled || !VisibleToCamera(surface, camera) || !GeometryUtility.TestPlanesAABB(planes, surface.bounds)) continue;
                Validate();
                renderer.EnqueuePass(capturePass);
                renderer.EnqueuePass(releasePass);
                break;
            }
        }

        private static bool VisibleToCamera(Renderer renderer, UnityEngine.Camera camera)
        {
            if ((camera.cullingMask & (1 << renderer.gameObject.layer)) == 0) return false;
            // Zero means the camera uses its normal scene culling. Preview/prefab cameras set a mask.
            return camera.overrideSceneCullingMask == 0 ||
                (camera.overrideSceneCullingMask & renderer.gameObject.sceneCullingMask) != 0;
        }

        private sealed class ReflectionFrame : ContextItem
        {
            public TextureHandle texture;
            public override void Reset() => texture = TextureHandle.nullHandle;
        }

        private struct Draw : IComparable<Draw>
        {
            public SpriteRenderer renderer;
            public int layer, order, spriteOrder;
            public int CompareTo(Draw other)
            {
                var result = layer.CompareTo(other.layer);
                if (result == 0) result = order.CompareTo(other.order);
                if (result == 0) result = spriteOrder.CompareTo(other.spriteOrder);
                return result != 0 ? result : renderer.GetEntityId().CompareTo(other.renderer.GetEntityId());
            }
        }

        private sealed class CapturePass : ScriptableRenderPass
        {
            private readonly WaterReflectionRendererFeature owner;
            private readonly MaterialPropertyBlock properties = new();
            private readonly Plane[] planes = new Plane[6];
            public CapturePass(WaterReflectionRendererFeature feature) { owner = feature; }
            private sealed class CaptureData
            {
                public readonly List<Draw> draws = new();
                public Material material;
                public Matrix4x4 captureVp;
                public float fadeDistance;
            }
            private sealed class PublishData { public Matrix4x4 worldToClip; }

            public override void RecordRenderGraph(RenderGraph graph, ContextContainer frameData)
            {
                var resources = frameData.Get<UniversalResourceData>();
                var cameraData = frameData.Get<UniversalCameraData>();
                var camera = cameraData.camera;
                // Imported backbuffers have no graph descriptor. This is a separate RGBA capture,
                // so use the camera descriptor for that normal direct-to-target rendering path.
                var descriptor = resources.isActiveTargetBackBuffer
                    ? new TextureDesc(cameraData.cameraTargetDescriptor)
                    : resources.activeColorTexture.GetDescriptor(graph);
                descriptor.name = "Water object reflections";
                descriptor.colorFormat = GraphicsFormat.R8G8B8A8_UNorm; // RGBA is required for transparent capture, including HDR cameras.
                descriptor.depthBufferBits = DepthBits.None;
                descriptor.msaaSamples = MSAASamples.None;
                descriptor.filterMode = FilterMode.Point;
                descriptor.clearBuffer = true;
                descriptor.clearColor = Color.clear;
                var texture = graph.CreateTexture(descriptor);
                frameData.GetOrCreate<ReflectionFrame>().texture = texture;
                using (var builder = graph.AddRasterRenderPass<CaptureData>("Capture water reflection sprites", out var data))
                {
                    data.material = owner.captureMaterial;
                    data.captureVp = GL.GetGPUProjectionMatrix(cameraData.GetProjectionMatrix(), true) * cameraData.GetViewMatrix();
                    data.fadeDistance = owner.maximumDistance;
                    data.draws.Clear();
                    GeometryUtility.CalculateFrustumPlanes(camera, planes);
                    foreach (var source in WaterReflectionSource.ActiveSources)
                    {
                        var groundY = source.GroundAnchor.position.y;
                        for (var spriteIndex = 0; spriteIndex < source.Sprites.Count; spriteIndex++)
                        {
                            var sprite = source.Sprites[spriteIndex];
                            // Hidden visuals and empty animation/equipment slots are valid presentation states.
                            if (!sprite.enabled || !sprite.gameObject.activeInHierarchy || !sprite.sprite || !VisibleToCamera(sprite, camera)) continue;
                            var bounds = sprite.bounds;
                            var center = bounds.center;
                            center.y = 2 * groundY - center.y;
                            bounds.center = center;
                            if (!GeometryUtility.TestPlanesAABB(planes, bounds)) continue;
                            sprite.GetPropertyBlock(properties);
                            properties.SetFloat(GroundId, groundY);
                            sprite.SetPropertyBlock(properties);
                            var group = source.Group;
                            data.draws.Add(new Draw { renderer = sprite,
                                layer = SortingLayer.GetLayerValueFromID(group ? group.sortingLayerID : sprite.sortingLayerID),
                                order = group ? group.sortingOrder : sprite.sortingOrder, spriteOrder = sprite.sortingOrder });
                        }
                    }
                    data.draws.Sort();
                    builder.SetRenderAttachment(texture, 0, AccessFlags.Write);
                    builder.AllowGlobalStateModification(true);
                    builder.SetRenderFunc(static (CaptureData pass, RasterGraphContext context) =>
                    {
                        context.cmd.SetGlobalMatrix(CaptureVpId, pass.captureVp);
                        context.cmd.SetGlobalFloat(FadeId, pass.fadeDistance);
                        foreach (var draw in pass.draws) context.cmd.DrawRenderer(draw.renderer, pass.material, 0, 0);
                    });
                }
                // URP 17.6's native 2D sprite passes do not declare arbitrary global textures.
                // Transition to shader-read before them, then retain the texture through their last draw below.
                using (var builder = graph.AddRasterRenderPass<PublishData>("Bind water reflections", out var data))
                {
                    data.worldToClip = cameraData.GetProjectionMatrix() * cameraData.GetViewMatrix();
                    builder.UseTexture(texture, AccessFlags.Read);
                    builder.SetGlobalTextureAfterPass(texture, TextureId);
                    builder.AllowGlobalStateModification(true);
                    builder.SetRenderFunc(static (PublishData pass, RasterGraphContext context) =>
                    {
                        context.cmd.SetGlobalMatrix(WorldToClipId, pass.worldToClip);
                        context.cmd.SetGlobalFloat(AvailableId, 1);
                    });
                }
            }
        }

        private sealed class ReleasePass : ScriptableRenderPass
        {
            private sealed class ReleaseData { }
            public override void RecordRenderGraph(RenderGraph graph, ContextContainer frameData)
            {
                var texture = frameData.Get<ReflectionFrame>().texture;
                using var builder = graph.AddRasterRenderPass<ReleaseData>("Release water reflections after sprites", out _);
                builder.UseTexture(texture, AccessFlags.Read);
                builder.SetGlobalTextureAfterPass(graph.defaultResources.blackTexture, TextureId);
                builder.AllowGlobalStateModification(true);
                builder.SetRenderFunc(static (ReleaseData pass, RasterGraphContext context) => context.cmd.SetGlobalFloat(AvailableId, 0));
            }
        }
    }
}
