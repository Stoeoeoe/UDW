using System.Collections;
using Core.Context;
using Core.Tile;

namespace Interaction.Tools.Hoe
{
    /// <summary>
    /// Tool action for plowing farmable land.
    /// </summary>
    public class HoeAction : ToolAction
    {
        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            yield return ForEachAffectedTile(snapshot, tile =>
            {
                MapManager.Instance.PlowTile(tile);
            });
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            
        }

        public override bool CanBeUsedOnTile(TileData tile)
        {
            return tile.TerrainData.IsFarmable;
        }
    }
}

