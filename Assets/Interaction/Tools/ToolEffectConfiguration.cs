using System;
using Core.Common;
using UnityEngine;

namespace Tools
{
    [Serializable]
    public class ToolEffectConfiguration
    {
        [Validation.Required("Assign a nonnull offset array; an empty array is allowed.")] public Vector2Int[] AffectedTileOffsets;
        public bool IsGlobalEffect;
    }
}