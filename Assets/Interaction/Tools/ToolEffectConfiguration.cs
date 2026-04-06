using System;
using UnityEngine;

namespace Tools
{
    [Serializable]
    public class ToolEffectConfiguration
    {
        public Vector2Int[] AffectedTileOffsets;
        public bool IsGlobalEffect;
    }
}