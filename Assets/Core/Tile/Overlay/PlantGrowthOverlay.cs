using System.Collections.Generic;
using Core.Context;
using Core.Location;
using Interaction.Tools;
using Plants;
using UnityEngine;
using UnityEngine.Tilemaps;
using VContainer;

namespace Core.Tile.Overlay
{
    /// <summary>Marks the crops near the pointer that the growth wand can advance. Tiles without a crop stay unmarked.</summary>
    public sealed class PlantGrowthOverlay : AbstractOverlay
    {
        [Inject] private PlantManager _plantManager;
        [Inject] private LevelManager _levelManager;

        [SerializeField] private ToolData wand;
        [SerializeField] private TileBase validTile;
        [SerializeField] private TileBase invalidTile;
        [SerializeField] private TileBase outOfRangeTile;

        public override bool ShouldShow(PlayerInteractionContextSnapshot snapshot) => snapshot.CurrentlyHeldItem == wand;

        public override IEnumerable<OverlayTileResult> Evaluate(IEnumerable<TileData> tiles,
            PlayerInteractionContextSnapshot snapshot)
        {
            if (snapshot.TileUnderCharacter == null) yield break;
            var locationId = _levelManager.CurrentLocationData.Id;
            foreach (var tile in tiles)
            {
                var crop = _plantManager.GetPlantState(locationId, tile.Coordinates);
                if (crop == null) continue;
                if (!ToolAction.IsInPointerRange(wand, snapshot.TileUnderCharacter, tile))
                    yield return new OverlayTileResult(tile.Coordinates, outOfRangeTile, OverlayData.OutOfRange);
                else if (_plantManager.CanAdvanceGrowthStage(crop))
                    yield return new OverlayTileResult(tile.Coordinates, validTile, OverlayData.Valid);
                else
                    yield return new OverlayTileResult(tile.Coordinates, invalidTile, OverlayData.Invalid);
            }
        }
    }
}
