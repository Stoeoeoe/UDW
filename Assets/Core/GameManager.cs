using UnityEngine;
using System;

namespace Core
{
    /// <summary>A component owned and wired by SystemRoot before Unity starts gameplay.</summary>
    public abstract class GameManager : MonoBehaviour
    {
        internal event Action Activated;
        internal event Action Deactivated;
        protected virtual void Awake() => OnAwake();
        protected virtual void OnEnable() => Activated?.Invoke();
        protected virtual void OnDisable() => Deactivated?.Invoke();
        protected virtual void OnAwake() { }
        protected virtual void OnDestroy() { }
    }
}
