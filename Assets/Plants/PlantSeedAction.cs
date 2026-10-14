using System.Collections;
using Character;
using Core.Context;
using Core.Tile;
using Interaction;
using UnityEngine;

namespace Plants
{
    /// <summary>Plants the player's selected seed on an available plowed tile within sowing range.</summary>
    public class PlantSeedAction : PrimaryAction
    {
        [SerializeField] public int sowRange = 2;

        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            if (!CanExecute(snapshot)) yield break;
            var seedItem = snapshot.CurrentlyHeldItem as SeedItem;
            var character = snapshot.Character as MainCharacter;
            PlantManager.Instance.TrySowCarriedSeed(Core.Location.LevelManager.Instance.CurrentLocationData.id,
                snapshot.CurrentTileDataUnderPointer, character!.MainInventory, character.CurrentSelectedSlotIndex);
            yield break;
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            
        }

        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot)
        {
            var targetTile = snapshot.CurrentTileDataUnderPointer;
            var characterTile = snapshot.TileUnderCharacter;
            if (snapshot.CurrentlyHeldItem is not SeedItem seed || targetTile == null || characterTile == null ||
                snapshot.Character is not MainCharacter character)
                return false;
            var index = character.CurrentSelectedSlotIndex;
            if (index < 0 || index >= character.MainInventory.Capacity || character.MainInventory.GetSlot(index).Item != seed)
                return false;

            var offset = targetTile.Coordinates - characterTile.Coordinates;
            return offset.sqrMagnitude <= sowRange * sowRange &&
                   targetTile.FarmlandData != null &&
                   targetTile.FarmlandData.IsPlowed &&
                   !targetTile.PlacedObject &&
                   !MapManager.Instance.IsTileOccupied(targetTile) &&
                   !PlantManager.Instance.HasPlantAtCurrentMap(targetTile.Coordinates);
        }

        public override Vector2 GetActionExecutionLocation(PlayerInteractionContextSnapshot snapshot)
        {
            return snapshot.CurrentTileDataUnderPointer.WorldPosition;
        }
    }
}
