using UnityEngine;

namespace Core.Tile
{
    [ExecuteAlways]
    public class TriggerDebugger : MonoBehaviour
    {
        void OnDrawGizmos()
        {
            var box = GetComponent<BoxCollider2D>();
            if (box == null) return;

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
