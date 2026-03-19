using MoreMountains.Tools;
using UnityEngine;

namespace Core.TimeAndWeather
{
    public struct DayLightUpdateEvent
    {
        public Color Color;
        
        static DayLightUpdateEvent e;
        public static void Trigger(Color color)
        {
            e.Color = color;
            MMEventManager.TriggerEvent(e);
        }
    }
}