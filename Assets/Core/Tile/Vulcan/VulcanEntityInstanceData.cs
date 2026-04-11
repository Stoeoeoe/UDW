using System;
using UnityEngine;

namespace Core.Tile.Vulcan
{
    [Serializable]
    public struct VulcanEntityInstanceData
    {
        public string id;
        public string typeId;
        public string layerId;
        public string label;
        public Vector2 pixelPosition;
        public float rotationDegrees;
        public string propertiesJson;
    }
}
