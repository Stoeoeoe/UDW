using System;
using Core.Game;

namespace Plants
{
    [Serializable]
    public class PlantState : WorldObjectState
    {
        public string plantID;
        public int daysPassedSincePlanting;
        public int consecutiveDaysWithoutWater;
        public PlantCondition condition = PlantCondition.Healthy;
        
        public PlantState(string plantID)
        {
            this.plantID = plantID;
            this.daysPassedSincePlanting = 0;
        }

        /// <summary>Growth days count watered days. Wilting is terminal until the crop is removed.</summary>
        public void AdvanceDay(bool irrigated, int daysWithoutWaterUntilWilt)
        {
            if (condition != PlantCondition.Healthy) return;
            if (irrigated)
            {
                consecutiveDaysWithoutWater = 0;
                daysPassedSincePlanting++;
            }
            else
            {
                consecutiveDaysWithoutWater++;
                if (consecutiveDaysWithoutWater >= Math.Max(1, daysWithoutWaterUntilWilt))
                    condition = PlantCondition.Wilted;
            }
        }
    }
}
