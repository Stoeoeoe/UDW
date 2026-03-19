using System.Collections.Generic;
using System.Linq;
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
            return growthStages.FirstOrDefault(g => g.daysToReachStage <= 0);
        }

        public GrowthStage GetGrowthStageByDays(int daysPassedSincePlanting)
        {
            return growthStages.Max(g => g.daysToReachStage <= daysPassedSincePlanting ? g : null);
        }
       
    }
}