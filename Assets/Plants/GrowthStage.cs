using System;
using Core.Common;
using Sirenix.OdinInspector;

namespace Items.Plants
{
    [Serializable]
    public class GrowthStage
    {
        public int daysToReachStage;
        public bool isHarvestable;
        [InlineProperty] public SpriteOrPrefab representation;
    }
}