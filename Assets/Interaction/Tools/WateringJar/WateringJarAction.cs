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
                MapManager.Instance.IrrigateTile(tile);
            });
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            
        }

        public override bool CanBeUsedOnTile(TileData tile)
        {
            return tile.IsFarmable && tile.FarmlandData is { IsPlowed: true };
        }
    }
}

