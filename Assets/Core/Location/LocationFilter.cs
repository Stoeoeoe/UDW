using System;

namespace Core.Common
{
    [Serializable]
    public class LocationFilter
    {
        public LocationType locationType = LocationType.Any;
        public FilterMode filterMode = FilterMode.Exclude;
        public string[] locationIds;
    }
}