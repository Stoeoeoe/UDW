using VContainer;
using UnityEngine;
using System.Threading;
using Core.Context;
using Core.Location;
using Core.Tile;
using Plants;

namespace Interaction.Tools
{
    /// <summary>Harvests scythe-ready crops in the tool's affected tiles and delivers their yield as world drops.</summary>
    public sealed class ScytheAction : ToolAction
    {
        [Inject] private PlantManager _plantManager;
        [Inject] private LevelManager _levelManager;

        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot) =>
            snapshot.SceneReady && GetAffectedTiles(snapshot).Count > 0;

        public override bool CanBeUsedOnTile(TileData tile) => tile != null &&
            _plantManager.CanHarvest(_levelManager.CurrentLocationData.id, tile.Coordinates, HarvestMethod.Scythe);

        public override async Awaitable OnExecute(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            // Cache the location before any harvest callback can start a transition.
            var locationId = _levelManager.CurrentLocationData.id;
            await ForEachAffectedTile(snapshot, cancellation, tile =>
                _plantManager.TryHarvestWithScythe(locationId, tile.Coordinates, tile.WorldPosition, out _), 0f);
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot) { }
    }
}
