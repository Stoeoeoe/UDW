using System;
using Core.Game;

namespace Plants
{
    [Serializable]
    public class PlantState : WorldObjectState
    {
        public string plantID;
        public int daysPassedSincePlanting;
        
        public PlantState(string plantID)
        {
            this.plantID = plantID;
            this.daysPassedSincePlanting = 0;
        }
    }
}
