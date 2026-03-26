using System.Collections;
using Character;
using Core.Context;
using Core.Tile.Overlay;
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
            
            PlantManager.Current.SowPlantOnCurrentMap(
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
            // TODO: We're conflating overlay validity with sowing validity here. Consider separating these concerns.
            // Use the overlay system to check if the target tile is valid
            var targetTile = snapshot.CurrentTileDataUnderPointer;

            return targetTile != null &&
                   TileOverlayManager.Current.IsTileValidInCurrentOverlay(targetTile.Coordinates);
        }

        public override Vector2 GetActionExecutionLocation(PlayerInteractionContextSnapshot snapshot)
        {
            return snapshot.CurrentTileDataUnderPointer.WorldPosition;
        }
    }
}