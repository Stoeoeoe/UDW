using System.Collections;
using System;
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
        public const string AnimationAction = "Seed";
        [SerializeField] public int sowRange = 2;
        private bool _playingSeedAnimation;

        public override float ActionDuration => Owner.Animator.AnimationLibrary
            .GetDirectional(AnimationAction, Owner.Orientation.FacingDirection).length;

        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            if (!CanExecute(snapshot)) yield break;
            if (!Owner.Animator.PlayNamedAction(AnimationAction))
                throw new InvalidOperationException("Planting requires an available Seed animation.");
            _playingSeedAnimation = true;
            var character = snapshot.Character as MainCharacter;
            PlantManager.Instance.TrySowCarriedSeed(Core.Location.LevelManager.Instance.CurrentLocationData.id,
                snapshot.CurrentTileDataUnderPointer, character!.MainInventory, character.CurrentSelectedSlotIndex);
            yield break;
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            
        }

        public override void OnEnd(PlayerInteractionContextSnapshot snapshot)
        {
            if (!_playingSeedAnimation) return;
            _playingSeedAnimation = false;
            Owner.Animator.EndNamedAnimation();
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
