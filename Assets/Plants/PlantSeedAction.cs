using System.Collections;
using Character;
using Core.Context;
using Core.Tile;
using Interaction;
using UnityEngine;

namespace Plants
{
    public class PlantSeedAction : PrimaryAction
    {
        [SerializeField] public int sowRange = 2;

        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            var seedItem = snapshot.CurrentlyHeldItem as SeedItem;
            var character = snapshot.Character as MainCharacter;
            character!.MainInventory.UseItem(character.CurrentlyHeldItem, character.CurrentSelectedSlotIndex);
            
            PlantManager.Instance.SowPlantOnCurrentMap(
                snapshot.CurrentTileDataUnderPointer.Coordinates,
                seedItem!.plantData.plantId
            );
            yield break;
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            
        }

        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot)
        {
            var targetTile = snapshot.CurrentTileDataUnderPointer;
            var characterTile = snapshot.TileUnderCharacter;
            if (!(snapshot.CurrentlyHeldItem is SeedItem) || targetTile == null || characterTile == null)
                return false;

            var offset = targetTile.Coordinates - characterTile.Coordinates;
            return offset.sqrMagnitude <= sowRange * sowRange &&
                   targetTile.FarmlandData != null &&
                   targetTile.FarmlandData.IsPlowed &&
                   !targetTile.PlacedObject &&
                   !MapManager.Instance.IsTileOccupied(targetTile);
        }

        public override Vector2 GetActionExecutionLocation(PlayerInteractionContextSnapshot snapshot)
        {
            return snapshot.CurrentTileDataUnderPointer.WorldPosition;
        }
    }
}
