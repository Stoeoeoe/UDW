using System.Collections.Generic;

namespace Core.Events
{
    /// <summary>
    /// Type-safe, static event bus. Raise and subscribe to events by type.
    /// </summary>
    public static class EventBus<T>
    {
        static readonly List<IEventListener<T>> _listeners = new();

        public static void Subscribe(IEventListener<T> listener)
        {
            if (!_listeners.Contains(listener))
                _listeners.Add(listener);
        }

        public static void Unsubscribe(IEventListener<T> listener)
        {
            _listeners.Remove(listener);
        }

        /// <summary>
        /// Raises the event. Iterates backwards so listeners can safely unsubscribe during dispatch.
        /// </summary>
        public static void Raise(T e)
        {
            for (int i = _listeners.Count - 1; i >= 0; i--)
                _listeners[i].OnEvent(e);
        }
    }
}
