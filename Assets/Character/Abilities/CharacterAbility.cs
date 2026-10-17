using Core.Location;
using Core.Tile;
using UnityEngine;

namespace Character.Abilities
{
    /// <summary>
    /// Base class for all character abilities. 
    /// Gets refs from parent GameCharacter on Awake. Input is read from InputManager.Instance.
    /// </summary>
    public abstract class CharacterAbility : MonoBehaviour, ILocationLifecycle
    {
        protected GameCharacter Character;
        protected Controller2D  Controller => Character.Controller;
        protected Orientation2D Orientation => Character.Orientation;

        protected virtual void Awake()
        {
            Character = GetComponentInParent<GameCharacter>();
            if (!Character) throw new System.InvalidOperationException("Character abilities require a parent character.");
        }

        protected virtual bool AbilityAuthorized => !Character.IsControlBlocked;

        // ── Convenience accessors ──────────────────────────────────────────────────

        protected TileData CurrentTileData  => Character.Tiles.Current;
        protected TileData TileDataInFront  => Character.Tiles.InFront;
        protected TileData TileDataInBack   => Character.Tiles.InBack;

        protected Vector2Int CurrentTileCoordinates =>
            Character.Tiles.Coordinates;

        protected Vector2Int GetTileCoordinatesInDirection(Vector2 relativeDirection)
        {
            var dir    = Controller.CurrentDirection;
            var coords = CurrentTileCoordinates;
            return coords + new Vector2Int((int)(dir.x * relativeDirection.x),
                                           (int)(dir.y * relativeDirection.y));
        }

        /// <summary>Use this method instead of "Update" to build time-sensitive behavior. </summary>
        public virtual void Tick()
        {
            
        }

        /// <summary>Use this method instead of "LateUpdate" to build time-sensitive behavior which should take place at
        /// the end of the frame. </summary>
        public virtual void TickLate()
        {
            
        }


        public virtual void OnLocationEnter(LocationData location)
        {
        }

        public virtual void OnLocationLeave(LocationData location)
        {
        }
    }
}
