using System.Collections.Generic;
using Core.Context;
using Plants;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Core.Tile.Overlay
{
    /// <summary>
    /// Overlay for planting seeds. Shows valid/invalid/out-of-range tiles around the cursor.
    /// </summary>
    public class PlantSeedOverlay : AbstractOverlay
    {
        [Header("Configuration")]
        [SerializeField] private int maxPlacementRange = 2;
        
        [Header("Tiles")]
        [SerializeField] private TileBase validTile;
        [SerializeField] private TileBase invalidTile;
        [SerializeField] private TileBase outOfRangeTile;

        public override bool ShouldShow(PlayerInteractionContextSnapshot snapshot)
        {
            // Show when player has a seed selected
            return snapshot.CurrentlyHeldItem is SeedItem;
        }

        public override IEnumerable<OverlayTileResult> Evaluate(
            IEnumerable<TileData> tiles,
            PlayerInteractionContextSnapshot snapshot)
        {
            if (!snapshot.Character || snapshot.TileUnderCharacter == null)
                yield break;

            var characterTile = snapshot.TileUnderCharacter;

            foreach (var tile in tiles)
            {
                var result = EvaluateTile(tile, characterTile);
                if (result.ShouldShow)
                    yield return result;
            }
        }

        private OverlayTileResult EvaluateTile(TileData tile, TileData characterTile)
        {
            // Check distance from character
            var distance = Vector2Int.Distance(characterTile.Coordinates, tile.Coordinates);
            if (distance > maxPlacementRange)
            {
                return new OverlayTileResult(tile.Coordinates, outOfRangeTile, OverlayData.OutOfRange);
            }

            // Check if tile is farmland and plowed
            if (tile.FarmlandData == null || !tile.FarmlandData.IsPlowed)
            {
                return new OverlayTileResult(tile.Coordinates, invalidTile, OverlayData.Invalid);
            }

            // Check if something is already placed
            return tile.PlacedObject ? new OverlayTileResult(tile.Coordinates, invalidTile, OverlayData.Invalid) :
                // Valid for planting
                new OverlayTileResult(tile.Coordinates, validTile, OverlayData.Valid);
        }
    }
}
