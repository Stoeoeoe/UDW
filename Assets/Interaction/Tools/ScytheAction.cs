using System.Collections;
using Core.Context;
using Core.Location;
using Core.Tile;
using Plants;

namespace Interaction.Tools
{
    /// <summary>Harvests scythe-ready crops in the tool's affected tiles and delivers their yield as world drops.</summary>
    public sealed class ScytheAction : ToolAction
    {
        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot) =>
            snapshot.SceneReady && GetAffectedTiles(snapshot).Count > 0;

        public override bool CanBeUsedOnTile(TileData tile) => tile != null &&
            PlantManager.Instance.CanHarvest(LevelManager.Instance.CurrentLocationData.id, tile.Coordinates, HarvestMethod.Scythe);

        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            // Cache the location before any harvest callback can start a transition.
            var locationId = LevelManager.Instance.CurrentLocationData.id;
            yield return ForEachAffectedTile(snapshot, tile =>
                PlantManager.Instance.TryHarvestWithScythe(locationId, tile.Coordinates, tile.WorldPosition, out _), 0f);
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot) { }
    }
}
