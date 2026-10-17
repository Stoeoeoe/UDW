using System;
using Core.Tile;
using UnityEngine;

namespace Character
{
    /// <summary>Location-bound tile queries and current-tile notifications, independent of movement state.</summary>
    [DisallowMultipleComponent]
    public sealed class CharacterTileContext : MonoBehaviour
    {
        private GameCharacter _character;
        private MapManager _map;
        public TileData Current { get; private set; }
        public Vector2Int Coordinates => _map.WorldToTileCoordinates(_character.ToolInteractionAnchor.position);
        public TileData InFront => InDirection(_character.Orientation.FacingDirection);
        public TileData InBack => InDirection(-_character.Orientation.FacingDirection);

        public void Bind(GameCharacter character)
        {
            if (!character) throw new ArgumentNullException(nameof(character));
            _character = character;
        }

        public void EnterLocation(MapManager map)
        {
            if (!map) throw new ArgumentNullException(nameof(map));
            _map = map;
            Refresh();
        }

        public void LeaveLocation()
        {
            _map = null;
            Current = null;
        }

        public void Refresh()
        {
            var tile = _map.GetTileDataAtCoordinates(Coordinates);
            if (tile == Current) return;
            Current = tile;
            CharacterChangedTileEvent.Trigger(tile, _character);
        }

        /// <summary>Placement can occur before location binding; entry performs the initial refresh in that case.</summary>
        public void OnPlaced()
        {
            if (_map) Refresh();
        }

        private TileData InDirection(Vector2 direction)
        {
            var origin = _map.GetInteractionOriginTile(_character.ToolInteractionAnchor.position, _character.Orientation.FacingDirection);
            return _map.GetTileDataAtCoordinates(origin + Vector2Int.RoundToInt(direction));
        }
    }
}
