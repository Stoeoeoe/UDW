using UnityEngine;

namespace EditorUI.Attributes
{
    /// <summary>
    /// Draws a Vector2 property as an interactive direction dial in the Inspector.
    /// The vector is always normalized when set via the dial.
    /// </summary>
    /// <example>
    /// [Dial(45)] public Vector2 facingDirection;   // snaps to 45° increments
    /// [Dial(0)]  public Vector2 windDirection;     // free rotation
    /// </example>
    public class DialAttribute : PropertyAttribute
    {
        /// <summary>Snap increment in degrees. 0 = free rotation.</summary>
        public float SnapAngle { get; }

        public DialAttribute(float snapAngle = 0f)
        {
            SnapAngle = snapAngle;
        }
    }
}
