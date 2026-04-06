using Character;
using UnityEngine;

namespace Core.Location
{
    /// <summary>
    /// Marks a position where the player can spawn. Keyed by a string so LevelManager can find it.
    /// SpawnPoints are primarily used for testing.
    /// To link locations with each other (doors, screen transitions etc.), use a LocationLink.
    /// </summary>
    public class SpawnPoint : MonoBehaviour
    {
        [SerializeField] private string key = "Default";
        public string Key => key;

        public void SpawnCharacter(GameCharacter character, Vector2 facingDirection)
        {
            character.transform.position = transform.position;
            character.Orientation.ForceDirection(facingDirection != Vector2.zero ? facingDirection : Vector2.down);
        }

        private void OnDrawGizmos()
        {
            Gizmos.color = Color.green;
            Gizmos.DrawIcon(transform.position, "sv_icon_dot3_pix16_gizmo", true);
            Gizmos.DrawWireSphere(transform.position, 0.2f);
        }
    }
}
