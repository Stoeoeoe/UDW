using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Core.Tile.Water
{
    /// <summary>
    /// Global water interaction state shared by all bodies: gameplay ripples, rain intensity and
    /// object contacts. Uploaded as shader globals before each camera renders.
    /// </summary>
    public static class WaterInteraction
    {
        // Must match WATER_MAX_RIPPLES / WATER_MAX_CONTACTS in PixelWater.shader.
        public const int MaxRipples = 16;
        public const int MaxContacts = 32;
        public const int MaxRadiusPixels = 32;

        internal static readonly HashSet<WaterContact> ActiveContacts = new();
        private static readonly Vector4[] Ripples = new Vector4[MaxRipples];
        private static readonly Vector4[] Contacts = new Vector4[MaxContacts];
        private static readonly List<WaterContact> VisibleContacts = new();
        private static readonly Plane[] Planes = new Plane[6];
        private static readonly int RipplesId = Shader.PropertyToID("_WaterRipples");
        private static readonly int ContactsId = Shader.PropertyToID("_WaterContacts");
        private static readonly int ContactCountId = Shader.PropertyToID("_WaterContactCount");
        private static readonly int ClockId = Shader.PropertyToID("_WaterInteractionClock");
        private static readonly int RainId = Shader.PropertyToID("_WaterRain");
        private static int nextRipple;
        private static float rain;
        private static Vector2 sortCenter;

        /// <summary>Rain splash density in [0,1]. Drive this from the weather system.</summary>
        public static float Rain
        {
            get => rain;
            set
            {
                if (!float.IsFinite(value) || value < 0 || value > 1)
                    throw new ArgumentOutOfRangeException(nameof(value), "Water rain intensity must be in [0,1].");
                rain = value;
            }
        }

        /// <summary>
        /// Starts an expanding ring at a world position. It grows one logical pixel per animation tick
        /// up to the given radius. The oldest ripple is replaced when all slots are in use.
        /// </summary>
        public static void SpawnRipple(Vector2 worldPosition, int radiusPixels)
        {
            if (!float.IsFinite(worldPosition.x) || !float.IsFinite(worldPosition.y))
                throw new ArgumentException("Ripple position must be finite.", nameof(worldPosition));
            if (radiusPixels < 1 || radiusPixels > MaxRadiusPixels)
                throw new ArgumentOutOfRangeException(nameof(radiusPixels), $"Ripple radius must be 1 to {MaxRadiusPixels} pixels.");
            Ripples[nextRipple] = new Vector4(worldPosition.x, worldPosition.y, Time.time, radiusPixels);
            nextRipple = (nextRipple + 1) % MaxRipples;
        }

        /// <summary>Finds the active water body whose surface tilemap has a tile at the world position.</summary>
        public static bool TryGetBody(Vector3 worldPosition, out WaterBody body)
        {
            foreach (var candidate in WaterBody.ActiveBodies)
            {
                var surface = candidate.Surface;
                if (surface && surface.HasTile(surface.WorldToCell(worldPosition)))
                {
                    body = candidate;
                    return true;
                }
            }
            body = null;
            return false;
        }

#if UNITY_EDITOR
        [UnityEditor.InitializeOnLoadMethod]
#endif
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void Initialize()
        {
            // Also runs with domain reload disabled, so stale ripples never survive into Play Mode.
            Array.Clear(Ripples, 0, Ripples.Length);
            nextRipple = 0;
            rain = 0;
            RenderPipelineManager.beginCameraRendering -= Upload;
            RenderPipelineManager.beginCameraRendering += Upload;
        }

        private static void Upload(ScriptableRenderContext context, UnityEngine.Camera camera)
        {
            Shader.SetGlobalVectorArray(RipplesId, Ripples);
            Shader.SetGlobalFloat(ClockId, Time.time);
            Shader.SetGlobalFloat(RainId, rain);

            VisibleContacts.Clear();
            GeometryUtility.CalculateFrustumPlanes(camera, Planes);
            foreach (var contact in ActiveContacts)
                if (contact.FoamVisible && GeometryUtility.TestPlanesAABB(Planes, contact.FoamBounds))
                    VisibleContacts.Add(contact);
            if (VisibleContacts.Count > MaxContacts)
            {
                // Keep the contacts nearest the view centre when a crowded scene exceeds the budget.
                sortCenter = camera.transform.position;
                VisibleContacts.Sort(static (a, b) =>
                    ((Vector2)a.FoamBounds.center - sortCenter).sqrMagnitude.CompareTo(
                        ((Vector2)b.FoamBounds.center - sortCenter).sqrMagnitude));
            }
            var count = Mathf.Min(VisibleContacts.Count, MaxContacts);
            for (var i = 0; i < count; i++) Contacts[i] = VisibleContacts[i].FoamData;
            Shader.SetGlobalVectorArray(ContactsId, Contacts);
            Shader.SetGlobalFloat(ContactCountId, count);
        }
    }
}
