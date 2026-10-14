using System;
using Core.Game;
using Core.TimeAndWeather;

namespace Plants
{
    /// <summary>Saved crop identity, growth age and water history, with rules for advancing its condition each day.</summary>
    [Serializable]
    public class PlantState : WorldObjectState
    {
        public string plantID;
        public int daysPassedSincePlanting;
        public int consecutiveDaysWithoutWater;
        public PlantCondition condition = PlantCondition.Healthy;
        public int daysSinceWilted;
        
        public PlantState(string plantID)
        {
            this.plantID = plantID;
            this.daysPassedSincePlanting = 0;
        }

        /// <summary>Growth days count watered days. Wilting is terminal until the crop is removed.</summary>
        public void AdvanceDay(PlantData definition, Season currentSeason, bool wasWatered)
        {
            if (condition == PlantCondition.Wilted)
            {
                daysSinceWilted++;
                return;
            }
            if (condition != PlantCondition.Healthy) return;
            if (wasWatered)
            {
                consecutiveDaysWithoutWater = 0;
                if (definition.CanGrowInSeason(currentSeason)) daysPassedSincePlanting++;
            }
            else
            {
                consecutiveDaysWithoutWater++;
                if (consecutiveDaysWithoutWater >= definition.DaysWithoutWaterUntilWilt)
                    condition = PlantCondition.Wilted;
            }
        }
    }
}
