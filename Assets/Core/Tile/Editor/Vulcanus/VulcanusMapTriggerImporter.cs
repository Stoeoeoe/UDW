using System;
using System.Collections.Generic;
using Core.Location;
using Core.Tile.Vulcan;
using Core.Tile.Vulcanus;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class VulcanusMapTriggerImporter
    {
        private const string InteractableLayerName = "Interactable";

        public static IReadOnlyDictionary<string, VulcanusMapAnchor> SpawnAnchors(
            Transform mapRoot,
            IReadOnlyList<AnchorDto> anchors,
            int mapHeight,
            int tileSize)
        {
            var result = new Dictionary<string, VulcanusMapAnchor>(StringComparer.OrdinalIgnoreCase);
            if (anchors == null || anchors.Count == 0)
                return result;

            var group = new GameObject("Anchors");
            group.transform.SetParent(mapRoot, false);

            foreach (var dto in anchors)
            {
                if (dto == null || string.IsNullOrWhiteSpace(dto.Id) || dto.Position == null || dto.Position.Count < 2)
                    continue;

                var go = new GameObject(string.IsNullOrWhiteSpace(dto.Name) ? dto.Id : dto.Name);
                go.transform.SetParent(group.transform, false);
                go.transform.localPosition = PixelToLocalPosition(dto.Position[0], dto.Position[1], mapHeight, tileSize);

                var facing = ReadFacing(dto.Facing);
                if (Mathf.Abs(dto.Rotation) > float.Epsilon)
                    go.transform.localRotation = Quaternion.Euler(0f, 0f, -dto.Rotation);
                else if (facing != Vector2.zero)
                    go.transform.localRotation = Quaternion.Euler(0f, 0f, Mathf.Atan2(facing.y, facing.x) * Mathf.Rad2Deg - 90f);

                var anchor = go.AddComponent<VulcanusMapAnchor>();
                anchor.Configure(dto.Id, dto.Name, facing, dto.Tags?.ToArray() ?? Array.Empty<string>());
                result[dto.Id] = anchor;
            }

            return result;
        }

        public static void SpawnTriggers(
            Transform mapRoot,
            IReadOnlyList<LocationLinkDto> links,
            IReadOnlyList<MapTriggerDto> triggers,
            IReadOnlyDictionary<string, VulcanusMapAnchor> anchorsById,
            int mapHeight,
            int tileSize,
            VulcanusWorldCatalog catalog)
        {
            if (triggers == null || triggers.Count == 0)
                return;

            var group = new GameObject("Triggers");
            group.transform.SetParent(mapRoot, false);

            var linksByTriggerId = IndexLinksByTriggerId(links);

            foreach (var trigger in triggers)
            {
                if (trigger == null || string.IsNullOrWhiteSpace(trigger.Id))
                    continue;

                linksByTriggerId.TryGetValue(trigger.Id, out var linkDto);
                CreateTriggerObject(group.transform, trigger, linkDto, anchorsById, mapHeight, tileSize, catalog);
            }
        }

        private static Dictionary<string, LocationLinkDto> IndexLinksByTriggerId(IReadOnlyList<LocationLinkDto> links)
        {
            var result = new Dictionary<string, LocationLinkDto>(StringComparer.OrdinalIgnoreCase);
            if (links == null)
                return result;

            foreach (var link in links)
            {
                if (link == null)
                    continue;

                if (string.IsNullOrWhiteSpace(link.TriggerId))
                {
                    Debug.LogWarning($"[VulcanusJsonImporter] Ignoring location link '{link.Id}' because it has no triggerId.");
                    continue;
                }

                if (result.ContainsKey(link.TriggerId))
                {
                    Debug.LogWarning($"[VulcanusJsonImporter] Ignoring duplicate location link trigger binding for '{link.TriggerId}'.");
                    continue;
                }

                result.Add(link.TriggerId, link);
            }

            return result;
        }

        private static void CreateTriggerObject(
            Transform parent,
            MapTriggerDto trigger,
            LocationLinkDto link,
            IReadOnlyDictionary<string, VulcanusMapAnchor> anchorsById,
            int mapHeight,
            int tileSize,
            VulcanusWorldCatalog catalog)
        {
            var go = new GameObject(BuildTriggerObjectName(link, trigger));
            go.transform.SetParent(parent, false);
            go.transform.localPosition = ReadTriggerPosition(trigger, mapHeight, tileSize);

            var triggerComponent = go.AddComponent<VulcanusMapTrigger>();
            triggerComponent.Configure(
                trigger.Id,
                trigger.Label,
                trigger.Type,
                trigger.Shape,
                trigger.Tags?.ToArray() ?? Array.Empty<string>());

            ApplyTriggerGeometry(go, trigger, tileSize);

            if (link == null)
                return;

            SetInteractableLayer(go);

            var locationLink = go.AddComponent<LocationLink>();
            InitializeLocationLink(locationLink.gameObject, link, trigger, anchorsById, catalog);
        }

        private static string BuildTriggerObjectName(LocationLinkDto link, MapTriggerDto trigger)
        {
            var id = link?.Id ?? trigger?.Id ?? "Trigger";
            var label = !string.IsNullOrWhiteSpace(link?.Label)
                ? link.Label
                : !string.IsNullOrWhiteSpace(trigger?.Label)
                    ? trigger.Label
                    : id;
            var prefix = link != null ? "LocationLink" : "Trigger";
            return $"{prefix}_{label}_{id}";
        }

        private static void InitializeLocationLink(
            GameObject instance,
            LocationLinkDto dto,
            MapTriggerDto trigger,
            IReadOnlyDictionary<string, VulcanusMapAnchor> anchorsById,
            VulcanusWorldCatalog catalog)
        {
            if (!instance.TryGetComponent<ILocationLink>(out _))
            {
                Debug.LogWarning($"[VulcanusImporter] Trigger '{trigger.Id}' references link '{dto.Id}', but no ILocationLink component was created.");
                return;
            }

            var data = BuildLocationLinkData(dto, trigger, anchorsById);
            VulcanusEntityInitializer.InitializeLocationLink(instance, data, catalog);
        }

        private static VulcanusLocationLinkData BuildLocationLinkData(
            LocationLinkDto dto,
            MapTriggerDto trigger,
            IReadOnlyDictionary<string, VulcanusMapAnchor> anchorsById)
        {
            var data = new VulcanusLocationLinkData
            {
                id = !string.IsNullOrEmpty(dto.Id) ? dto.Id : Guid.NewGuid().ToString("N"),
                label = dto.Label ?? string.Empty,
                sourcePosition = ReadTriggerPixelPosition(trigger),
                triggerSize = ReadTriggerPixelSize(trigger),
                targetMapId = dto.TargetMapId ?? string.Empty,
                targetPosition = dto.TargetPosition != null && dto.TargetPosition.Count >= 2
                    ? new Vector2(dto.TargetPosition[0], dto.TargetPosition[1])
                    : Vector2.zero,
                targetLinkId = !string.IsNullOrWhiteSpace(dto.TargetAnchorId)
                    ? dto.TargetAnchorId
                    : dto.TargetLinkId ?? string.Empty,
                direction = dto.Direction ?? string.Empty
            };

            if (anchorsById != null &&
                !string.IsNullOrWhiteSpace(dto.TargetAnchorId) &&
                anchorsById.TryGetValue(dto.TargetAnchorId, out var anchor) &&
                anchor != null &&
                anchor.FacingDirection != Vector2.zero)
            {
                data.targetFacing = anchor.FacingDirection;
                data.hasTargetFacing = true;
                return data;
            }

            if (dto.TargetFacing != null && dto.TargetFacing.Count >= 2)
            {
                data.targetFacing = new Vector2(dto.TargetFacing[0], -dto.TargetFacing[1]);
                data.hasTargetFacing = data.targetFacing != Vector2.zero;
            }

            return data;
        }

        private static Vector3 ReadTriggerPosition(MapTriggerDto dto, int mapHeight, int tileSize)
        {
            var position = ReadTriggerPixelPosition(dto);
            return PixelToLocalPosition(position.x, position.y, mapHeight, tileSize);
        }

        private static Vector2 ReadTriggerPixelPosition(MapTriggerDto dto)
        {
            return TryGetTriggerPixelBounds(dto, out var position, out _)
                ? position
                : Vector2.zero;
        }

        private static Vector2 ReadTriggerPixelSize(MapTriggerDto dto)
        {
            return TryGetTriggerPixelBounds(dto, out _, out var size)
                ? size
                : Vector2.one;
        }

        private static bool TryGetTriggerPixelBounds(MapTriggerDto dto, out Vector2 position, out Vector2 size)
        {
            position = Vector2.zero;
            size = Vector2.one;

            if (dto == null)
                return false;

            if (dto.Points != null && dto.Points.Count > 0)
            {
                var hasPoint = false;
                var min = Vector2.zero;
                var max = Vector2.zero;

                for (var i = 0; i < dto.Points.Count; i++)
                {
                    var point = dto.Points[i];
                    if (point == null || point.Count < 2)
                        continue;

                    var current = new Vector2(point[0], point[1]);
                    if (!hasPoint)
                    {
                        min = current;
                        max = current;
                        hasPoint = true;
                        continue;
                    }

                    min = Vector2.Min(min, current);
                    max = Vector2.Max(max, current);
                }

                if (hasPoint)
                {
                    position = min;
                    size = Vector2.Max(max - min, new Vector2(0.001f, 0.001f));
                    return true;
                }
            }

            var x = dto.Position != null && dto.Position.Count > 0 ? dto.Position[0] : 0f;
            var y = dto.Position != null && dto.Position.Count > 1 ? dto.Position[1] : 0f;
            var width = dto.Size != null && dto.Size.Count > 0 ? dto.Size[0] : 1f;
            var height = dto.Size != null && dto.Size.Count > 1 ? dto.Size[1] : 1f;

            position = new Vector2(x, y);
            size = new Vector2(width, height);
            return true;
        }

        private static Vector2 ReadFacing(IReadOnlyList<float> facing)
        {
            if (facing == null || facing.Count < 2)
                return Vector2.zero;

            var value = new Vector2(facing[0], -facing[1]);
            return value == Vector2.zero ? Vector2.zero : value.normalized;
        }

        private static Vector3 PixelToLocalPosition(float pixelX, float pixelY, int mapHeight, int tileSize)
        {
            var ts = Mathf.Max(1, tileSize);
            return new Vector3(pixelX / ts, (mapHeight * ts - pixelY) / ts, 0f);
        }

        private static void ApplyTriggerGeometry(GameObject go, MapTriggerDto trigger, int tileSize)
        {
            if (trigger.Shape.Equals("polygon", StringComparison.OrdinalIgnoreCase))
                EnsurePolygonTriggerCollider(go, trigger, tileSize);
            else
                EnsureBoxTriggerCollider(go, ReadTriggerPixelSize(trigger), tileSize);
        }

        private static void EnsureBoxTriggerCollider(GameObject go, Vector2 triggerSizePixels, int tileSize)
        {
            var polygon = go.GetComponent<PolygonCollider2D>();
            if (polygon != null)
                UnityEngine.Object.DestroyImmediate(polygon);

            var box = go.GetComponent<BoxCollider2D>();
            if (box == null)
                box = go.AddComponent<BoxCollider2D>();

            box.isTrigger = true;

            var worldWidth = Mathf.Max(0.001f, triggerSizePixels.x / Mathf.Max(1, tileSize));
            var worldHeight = Mathf.Max(0.001f, triggerSizePixels.y / Mathf.Max(1, tileSize));
            box.offset = new Vector2(worldWidth * 0.5f, -worldHeight * 0.5f);
            box.size = new Vector2(worldWidth, worldHeight);

            TryAddTriggerDebugger(go);
        }

        private static void EnsurePolygonTriggerCollider(GameObject go, MapTriggerDto trigger, int tileSize)
        {
            var box = go.GetComponent<BoxCollider2D>();
            if (box != null)
                UnityEngine.Object.DestroyImmediate(box);

            var polygon = go.GetComponent<PolygonCollider2D>();
            if (polygon == null)
                polygon = go.AddComponent<PolygonCollider2D>();

            var ts = Mathf.Max(1, tileSize);
            var points = trigger.Points;
            if (points == null || points.Count < 3)
            {
                Debug.LogWarning($"[VulcanusJsonImporter] Trigger '{trigger.Id}' is polygonal but has fewer than three points.");
                return;
            }

            var origin = ReadTriggerPixelPosition(trigger);
            var colliderPoints = new Vector2[points.Count];
            for (var i = 0; i < points.Count; i++)
            {
                var point = points[i];
                if (point == null || point.Count < 2)
                    continue;

                colliderPoints[i] = new Vector2((point[0] - origin.x) / ts, -(point[1] - origin.y) / ts);
            }

            polygon.isTrigger = true;
            polygon.offset = Vector2.zero;
            polygon.points = colliderPoints;

            TryAddTriggerDebugger(go);
        }

        public static void SpawnColliders(
            Transform mapRoot,
            IReadOnlyList<MapCollisionDto> collisions,
            int mapHeight,
            int tileSize)
        {
            if (collisions == null || collisions.Count == 0)
                return;

            var group = new GameObject("Collisions");
            group.transform.SetParent(mapRoot, false);

            foreach (var dto in collisions)
            {
                if (dto == null || string.IsNullOrWhiteSpace(dto.Id))
                    continue;

                CreateCollisionObject(group.transform, dto, mapHeight, tileSize);
            }
        }

        private static void CreateCollisionObject(
            Transform parent,
            MapCollisionDto dto,
            int mapHeight,
            int tileSize)
        {
            var ts = Mathf.Max(1, tileSize);
            var px = dto.Position != null && dto.Position.Count > 0 ? dto.Position[0] : 0f;
            var py = dto.Position != null && dto.Position.Count > 1 ? dto.Position[1] : 0f;

            var go = new GameObject(string.IsNullOrWhiteSpace(dto.Label) ? dto.Id : $"{dto.Label}_{dto.Id}");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = PixelToLocalPosition(px, py, mapHeight, ts);

            if (dto.Shape.Equals("circle", StringComparison.OrdinalIgnoreCase))
            {
                var cc = go.AddComponent<CircleCollider2D>();
                cc.radius = dto.Radius / ts;
                // position is center for circles; offset collider so it stays at center
                cc.offset = Vector2.zero;
            }
            else if (dto.Shape.Equals("polygon", StringComparison.OrdinalIgnoreCase))
            {
                var points = dto.Points;
                if (points == null || points.Count < 3)
                {
                    Debug.LogWarning($"[VulcanusImporter] Collision '{dto.Id}' is a polygon but has fewer than 3 points.");
                    UnityEngine.Object.DestroyImmediate(go);
                    return;
                }

                var pc = go.AddComponent<PolygonCollider2D>();
                var verts = new Vector2[points.Count];
                for (var i = 0; i < points.Count; i++)
                {
                    var p = points[i];
                    if (p == null || p.Count < 2) continue;
                    // Points are absolute pixel coords; make them relative to the object's position
                    verts[i] = new Vector2((p[0] - px) / ts, -(p[1] - py) / ts);
                }
                pc.points = verts;
            }
            else // rectangle (default)
            {
                var w = dto.Size != null && dto.Size.Count > 0 ? dto.Size[0] : 1f;
                var h = dto.Size != null && dto.Size.Count > 1 ? dto.Size[1] : 1f;
                var bc = go.AddComponent<BoxCollider2D>();
                bc.size = new Vector2(w / ts, h / ts);
                // position is top-left for rectangles; offset so center is correct
                bc.offset = new Vector2(w / ts * 0.5f, -h / ts * 0.5f);
            }
        }

        private static void SetInteractableLayer(GameObject go)
        {
            var interactableLayer = LayerMask.NameToLayer(InteractableLayerName);
            if (interactableLayer >= 0)
                go.layer = interactableLayer;
        }

        private static void TryAddTriggerDebugger(GameObject go)
        {
            if (go.GetComponent<TriggerDebugger>() == null)
                go.AddComponent<TriggerDebugger>();
        }
    }
}
