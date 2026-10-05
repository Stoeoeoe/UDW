using System.Collections.Generic;
using Items.Plants;
using UnityEngine;

namespace Plants
{
    [CreateAssetMenu(fileName = "PlantData", menuName = "Game/Plant Data")]
    public class PlantData : ScriptableObject
    {
        public string plantId;
        public string label;
        public string description;
        public List<GrowthStage> growthStages;
        
        public GrowthStage GetSeedStage()
        {
            return growthStages != null && growthStages.Count > 0 && growthStages[0]?.daysToReachStage == 0
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
            if (growthStages == null || growthStages.Count == 0 || growthStages[0] == null || growthStages[0].daysToReachStage != 0)
                return -1;

            var best = 0;
            for (var i = 1; i < growthStages.Count; i++)
            {
                var stage = growthStages[i];
                if (stage == null || stage.daysToReachStage > daysPassedSincePlanting) break;
                best = i;
            }
            return best;
        }
    }
}
