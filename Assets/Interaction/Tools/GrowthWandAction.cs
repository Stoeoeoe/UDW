using System.Threading;
using Core.Context;
using Core.Location;
using Core.Tile;
using Plants;
using UnityEngine;
using VContainer;

namespace Interaction.Tools
{
    /// <summary>Moves the targeted crop to its next growth stage. Its stamina cost is charged by the tool system.</summary>
    public sealed class GrowthWandAction : ToolAction
    {
        [Inject] private PlantManager _plantManager;
        [Inject] private LevelManager _levelManager;

        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot) =>
            snapshot.SceneReady && GetAffectedTiles(snapshot).Count > 0;

        public override bool CanBeUsedOnTile(TileData tile) => tile != null &&
            _plantManager.CanAdvanceGrowthStage(_levelManager.CurrentLocationData.id, tile.Coordinates);

        public override async Awaitable OnExecute(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            var locationId = _levelManager.CurrentLocationData.id;
            await ForEachAffectedTile(snapshot, cancellation,
                tile => _plantManager.TryAdvanceGrowthStage(locationId, tile.Coordinates), 0f);
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot) { }
    }
}
