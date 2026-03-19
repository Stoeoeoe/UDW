using System;

namespace Plants
{
    [Serializable]
    public class PlantState
    {
        public string plantID;
        public int daysPassedSincePlanting;
        public int growthStageIndex;
        
        public PlantState(string plantID)
        {
            this.plantID = plantID;
            this.daysPassedSincePlanting = 0;
            this.growthStageIndex = 0;
        }
    }
}