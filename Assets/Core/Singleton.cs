using UnityEngine;

namespace Core
{
    public abstract class Singleton<T> : MonoBehaviour where T : MonoBehaviour
    {
        // Use a backing field so the property getter can do a Unity-aware null check.
        // Unity's destroyed objects are not C# null, so ?. alone is not safe.
        private static T _instance;
        public static T Instance => _instance ? _instance : null;

        protected virtual void Awake()
        {
            if (_instance != null)
            {
                Destroy(gameObject);
                return;
            }
            _instance = (T)(MonoBehaviour)this;
            OnAwake();
        }

        protected virtual void OnDestroy()
        {
            if (_instance == this)
                _instance = null;
        }

        protected virtual void OnAwake() { }
    }
}
