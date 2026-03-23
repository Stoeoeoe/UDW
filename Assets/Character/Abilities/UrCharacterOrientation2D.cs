using System;
using UnityEngine;

namespace Character.Abilities
{
    /// <summary>
    /// Legacy orientation component. Superseded by the new Orientation2D MonoBehaviour.
    /// Kept as a stub so existing scene prefab references do not break.
    /// </summary>
    [Obsolete("Use Character.Orientation2D instead.")]
    public class UrCharacterOrientation2D : MonoBehaviour { }
}