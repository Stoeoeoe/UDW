using System;
using Core.Common;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Items.Plants
{
    /// <summary>Defines a crop stage's watered-day threshold, visual representation and harvest availability.</summary>
    [Serializable]
    public class GrowthStage
    {
        [SerializeField]
        private int _daysToReachStage;

        [SerializeField]
        private bool _isHarvestable;

        [InlineProperty, SerializeField, Validation.Required, Validation.Nested]
        private SpriteOrPrefab _representation;

        public int DaysToReachStage => _daysToReachStage;
        public bool IsHarvestable => _isHarvestable;
        public SpriteOrPrefab Representation => _representation;

    }
}
