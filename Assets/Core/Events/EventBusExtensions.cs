namespace Core.Events
{
    /// <summary>
    /// Extension methods for subscribing/unsubscribing from the EventBus.
    /// Call this.Subscribe&lt;T&gt;() in OnEnable and this.Unsubscribe&lt;T&gt;() in OnDisable.
    /// </summary>
    public static class EventBusExtensions
    {
        public static void Subscribe<T>(this IEventListener<T> listener)
            => EventBus<T>.Subscribe(listener);

        public static void Unsubscribe<T>(this IEventListener<T> listener)
            => EventBus<T>.Unsubscribe(listener);
    }
}
