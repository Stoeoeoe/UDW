using System.Collections;
using Core.Context;
using Core.Tile;

namespace Interaction.Tools.WateringJar
{
    /// <summary>
    /// Tool action for watering plowed farmland.
    /// </summary>
    public class WateringJarAction : ToolAction
    {
        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            yield return ForEachAffectedTile(snapshot, tile =>
            {
                MapManager.Current.IrrigateTile(tile);
            });
        }

        public override bool CanBeUsedOnTile(TileData tile)
        {
            return tile.TerrainData.IsFarmable && tile.FarmlandData is { IsPlowed: true };
        }
    }
}

