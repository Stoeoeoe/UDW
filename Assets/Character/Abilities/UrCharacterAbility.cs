using System.Collections.Generic;
using Animancer;
using Core;
using Core.Tile;
using UnityEngine;
using TerrainData = Core.Tile.TerrainData;

namespace Character.Abilities
{
    /// <summary>
    /// Base class for all Ur-prefixed legacy abilities. Extends the new CharacterAbility.
    /// </summary>
    public class UrCharacterAbility : CharacterAbility
    {

        public TileData CurrentTileData  => Character?.CurrentTileData;
        public TileData TileDataInFront  => Character?.TileDataInFront;
        public TileData TileDataInBack   => Character?.TileDataInBack;

        public ConditionState CurrentCondition     => Character?.ConditionState ?? ConditionState.Normal;
        public MovementState  CurrentMovementState => Character?.MovementState  ?? MovementState.Idle;

        protected NamedAnimancerComponent Animancer => Character?.Animancer;

        public Vector2Int CurrentTileCoordinates =>
            MapManager.Instance != null && Character != null
                ? MapManager.Instance.GetCurrentTileCoordinates(Character)
                : Vector2Int.zero;

        public Vector2Int GetTileCoordinatesInDirection(Vector2 relativeDirection)
        {
            var dir = Controller.CurrentDirection;
            return CurrentTileCoordinates + new Vector2Int(
                (int)(dir.x * relativeDirection.x),
                (int)(dir.y * relativeDirection.y));
        }
    }
}