using Core.Context;
using Core.Tile;

namespace Interaction
{
    public abstract class TileAction : PrimaryAction
    {
        public abstract TileData[] GetAffectedTiles(PlayerInteractionContextSnapshot snapshot);
    }
}