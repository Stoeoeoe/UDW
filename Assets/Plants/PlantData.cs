using System;
using System.Collections.Generic;
using Items.Plants;
using Core.Common;
using UnityEngine;

namespace Plants
{
    [CreateAssetMenu(fileName = "Plant Data", menuName = "Game/Items/Plants/Plant Data")]
    public class PlantData : ScriptableObject
    {
        public string plantId;
        public string label;
        public string description;
        [SerializeField, Min(1)] private int daysWithoutWaterUntilWilt = 5;
        [SerializeField] private SpriteOrPrefab wiltedRepresentation;
        public int DaysWithoutWaterUntilWilt => Mathf.Max(1, daysWithoutWaterUntilWilt);
        public SpriteOrPrefab WiltedRepresentation => wiltedRepresentation;
        [SerializeField] private List<GrowthStage> growthStages;
        public IReadOnlyList<GrowthStage> GrowthStages => growthStages == null ? Array.Empty<GrowthStage>() : growthStages.AsReadOnly();
        
        public GrowthStage GetSeedStage()
        {
            return growthStages != null && growthStages.Count > 0 && growthStages[0]?.DaysToReachStage == 0
                ? growthStages[0]
                : null;
        }

        public GrowthStage GetGrowthStageByDays(int daysPassedSincePlanting)
        {
            var index = GetGrowthStageIndexByDays(daysPassedSincePlanting);
            return index >= 0 ? growthStages[index] : null;
        }

        public int GetGrowthStageIndexByDays(int daysPassedSincePlanting)
        {
            if (growthStages == null || growthStages.Count == 0 || growthStages[0] == null || growthStages[0].DaysToReachStage != 0)
                return -1;

            var best = 0;
            for (var i = 1; i < growthStages.Count; i++)
            {
                var stage = growthStages[i];
                if (stage == null || stage.DaysToReachStage > daysPassedSincePlanting) break;
                best = i;
            }
            return best;
        }
    }
}
