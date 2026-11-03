using UnityEngine;
using System.Threading;
using Core.Context;
using Core.Tile;

namespace Interaction.Tools.Hoe
{
    /// <summary>
    /// Tool action for plowing farmable land.
    /// </summary>
    public class HoeAction : ToolAction
    {

        public override async Awaitable OnExecute(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            await ForEachAffectedTile(snapshot, cancellation, tile =>
            {
                _mapManager.PlowTile(tile);
            });
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            
        }

        public override bool CanBeUsedOnTile(TileData tile)
        {
            return tile != null && tile.IsFarmable && tile.FarmlandData is not { IsPlowed: true } &&
                !tile.PlacedObject && !_mapManager.IsTileOccupied(tile, Character);
        }
    }
}

