using Core.Events;

namespace Core.TimeAndWeather
{
    public struct NewDayEvent
    {
        public int Day;

        public static void Trigger(int day)
            => EventBus<NewDayEvent>.Raise(new NewDayEvent { Day = day });
    }
}
