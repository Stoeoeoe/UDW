using System.Threading;
using System;
using Character;
using Core.Context;
using Core.Inventory;
using Core.Tile;
using MoreMountains.Feedbacks;
using UnityEngine;

namespace Interaction.Tools.WateringJar
{
    /// <summary>
    /// Waters plowed farmland with saved charges, or refills while facing fresh water.
    /// </summary>
    public class WateringJarAction : ToolAction
    {

        [SerializeField] private MMFeedbacks refillFeedback;
        [SerializeField, Min(0.01f)] private float refillDuration = 0.8f;

        public ToolChargeState Water => Character.Loadout.GetToolCharge(ToolData);
        public bool IsRefilling => IsFreshWater(TileDataInFront);
        public override int StaminaCost => IsRefilling ? 0 : base.StaminaCost;
        public override MMFeedbacks ExecuteFeedback => IsRefilling ? refillFeedback : base.ExecuteFeedback;
        public override Vector2 GetActionExecutionLocation(PlayerInteractionContextSnapshot snapshot) =>
            IsRefilling ? TileDataInFront.WorldPosition : base.GetActionExecutionLocation(snapshot);

        public override void Initialize(GameCharacter owner)
        {
            base.Initialize(owner);
            if (ToolData.maxCharge <= 0 || ToolData.chargePerUsage <= 0 || ToolData.chargePerUsage > ToolData.maxCharge)
                throw new InvalidOperationException("A watering jug requires positive capacity and a usage cost within that capacity.");
            if (!refillFeedback || refillDuration <= 0f)
                throw new InvalidOperationException("A watering jug requires refill feedback and a positive refill duration.");
        }

        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot) => IsRefilling
            ? Water.Current < Water.Capacity
            : Water.Current >= ToolData.chargePerUsage;

        public override bool CanExecuteAfterPreparation(PlayerInteractionContextSnapshot snapshot) =>
            CanExecute(snapshot);

        public override async Awaitable OnExecute(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            if (IsRefilling)
            {
                await Awaitable.WaitForSecondsAsync(refillDuration, cancellation);
                Water.Refill();
                return;
            }

            // A pour still spends water on bare or already-wet ground, even though no farmland changes.
            if (AffectedTiles.Count == 0)
            {
                Water.TryConsume(ToolData.chargePerUsage);
                return;
            }

            var affectedTiles = AffectedTiles;
            foreach (var tile in affectedTiles)
            {
                if (!Water.TryConsume(ToolData.chargePerUsage)) return;
                _mapManager.IrrigateTile(tile);
                cancellation.ThrowIfCancellationRequested();
                if (affectedTiles.Count > 1) await Awaitable.WaitForSecondsAsync(0.2f, cancellation);
            }
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            
        }

        public override bool CanBeUsedOnTile(TileData tile)
        {
            return tile != null && tile.IsFarmable && tile.FarmlandData is { IsPlowed: true, IsIrrigated: false };
        }

        public static bool IsFreshWater(TileData tile) =>
            tile != null && tile.IsFreshwater;
    }
}

