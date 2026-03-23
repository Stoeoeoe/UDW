using Core.Events;
using UnityEngine;

namespace Core.TimeAndWeather
{
    public struct DayLightUpdateEvent
    {
        public Color Color;

        public static void Trigger(Color color)
            => EventBus<DayLightUpdateEvent>.Raise(new DayLightUpdateEvent { Color = color });
    }
}