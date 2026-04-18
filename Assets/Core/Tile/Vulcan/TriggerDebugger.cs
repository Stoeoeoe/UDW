using UnityEngine;
using System.Linq;

namespace Core.Tile.Vulcan
{
    [ExecuteAlways]
    public class TriggerDebugger : MonoBehaviour
    {
        void OnDrawGizmos()
        {
            var box = GetComponent<BoxCollider2D>();
            if (box == null)
            {
                var poly = GetComponent<PolygonCollider2D>();
                if (poly == null) return;

                // Draw polygon outline
                for (int p = 0; p < poly.pathCount; p++)
                {
                    var path = poly.GetPath(p);
                    if (path.Length <= 1) continue;
                    var worldPts = path.Select(pt => transform.TransformPoint(pt + poly.offset)).ToArray();

                    Gizmos.color = new Color(0f, 1f, 0f, 0.12f);
                    // Optionally draw a lightly filled bounding box as a simple visual cue
                    var bbMin = worldPts.Aggregate((a, b) => Vector3.Min(a, b));
                    var bbMax = worldPts.Aggregate((a, b) => Vector3.Max(a, b));
                    var bbCenter = (bbMin + bbMax) * 0.5f;
                    var bbSize = bbMax - bbMin;
                    Gizmos.DrawCube(bbCenter, new Vector3(bbSize.x, bbSize.y, 0.01f));

                    Gizmos.color = Color.green;
                    for (int i = 0; i < worldPts.Length; i++)
                    {
                        var a = worldPts[i];
                        var b = worldPts[(i + 1) % worldPts.Length];
                        Gizmos.DrawLine(a, b);
                    }
                }

                return;
            }

            var worldCenter = transform.TransformPoint(box.offset);
            var worldSize = new Vector3(box.size.x * transform.lossyScale.x, box.size.y * transform.lossyScale.y, 0.01f);

            var fill = new Color(0f, 1f, 0f, 0.12f);
            Gizmos.color = fill;
            Gizmos.DrawCube(worldCenter, worldSize);

            Gizmos.color = Color.green;
            Gizmos.DrawWireCube(worldCenter, worldSize);
        }
    }
}
