using System;
using Core.Common;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Items.Plants
{
    [Serializable]
    public class GrowthStage
    {
        [SerializeField] private int daysToReachStage;
        [SerializeField] private bool isHarvestable;
        [InlineProperty, SerializeField] private SpriteOrPrefab representation;

        public int DaysToReachStage => daysToReachStage;
        public bool IsHarvestable => isHarvestable;
        public SpriteOrPrefab Representation => representation;
    }
}
