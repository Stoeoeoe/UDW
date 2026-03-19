using UnityEngine;

namespace Core.TimeAndWeather.Seasons
{
    public struct SeasonStartEvent
    {
	    private static event Delegate OnEvent;
	    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)] private static void RuntimeInitialization() { OnEvent = null; }
	    public static void Register(Delegate callback) { OnEvent += callback; }
	    public static void Unregister(Delegate callback) { OnEvent -= callback; }

	    public delegate void Delegate(SeasonData newSeason);
	    public static void Trigger(SeasonData newSeason)
	    {
		    OnEvent?.Invoke(newSeason);
	    }
    }
}