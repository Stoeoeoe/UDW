using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using Character;
using Core.Context;
using Core.Tile;
using Sirenix.OdinInspector;
using UnityEngine;
using VContainer;

namespace Interaction.Tools
{
    /// <summary>
    /// A specialized AbstractAction for tools that work on tiles.
    /// Combines the lifecycle management of AbstractAction with tile-based functionality.
    /// Settings like cooldown and freeze duration are derived from ToolData.
    /// </summary>
    public abstract class ToolAction : AbstractAction
    {
        [Inject] protected MapManager _mapManager;

        [PropertyOrder(-10)]
        [Header("Tool Settings")]
        [field: SerializeField] public ToolData ToolData { get; private set; }
        
        [PropertyOrder(-9)]
        [field: SerializeField] public bool ExecuteFeedbackPerAffectedTile { get; private set; }
        
        
        // Override base virtual properties - tools get values from ToolData
        public override float CooldownTime => ToolData != null ? ToolData.cooldownDuration : 0f;
        public virtual int StaminaCost => ToolData.staminaCost;
        public override bool FreezeCharacterDuringAction => true; // Tools currently always freeze character
        

        protected GameCharacter Character => Owner;
        protected TileData CurrentTileData => Character.Tiles.Current;
        protected TileData TileDataInFront => _capturedAffectedTiles != null ? _capturedFrontTile : Character.Tiles.InFront;
        protected TileData TileDataInBack => Character.Tiles.InBack;

        // Targets held steady for the current action attempt
        private List<TileData> _capturedAffectedTiles;
        private TileData _capturedFrontTile;
        
        /// <summary>
        /// Gets the captured affected tiles, or a live preview outside an attempt.
        /// CaptureTargets fixes the targets used during execution.
        /// </summary>
        public List<TileData> AffectedTiles => _capturedAffectedTiles ?? ComputeAffectedTiles();

        /// <summary>
        /// Captures the front tile and affected tiles for this action attempt.
        /// Used for the preparation preview, then refreshed on release and held stable through execution.
        /// </summary>
        public void CaptureTargets(PlayerInteractionContextSnapshot snapshot)
        {
            _capturedFrontTile = Character.Tiles.InFront;
            _capturedAffectedTiles = ComputeAffectedTiles(snapshot);
        }

        /// <summary>
        /// Releases the captured targets at the end of the action attempt.
        /// </summary>
        public void ClearCapturedTargets()
        {
            _capturedAffectedTiles = null;
            _capturedFrontTile = null;
        }

        /// <summary>
        /// Computes the tiles affected by this tool based on the tool's effect configuration.
        /// Override to customize which tiles are affected.
        /// </summary>
        private List<TileData> ComputeAffectedTiles(PlayerInteractionContextSnapshot snapshot = null)
        {
            var tiles = ToolData.targeting == ToolTargeting.Pointer
                ? PointerTarget(snapshot)
                : _mapManager.GetTilesFromEffectConfiguration(Character, ToolData.toolEffectConfiguration);
            return tiles.Where(CanBeUsedOnTile).ToList();
        }

        /// <summary>Whether a pointer-targeted tile is close enough to the character, by straight-line distance between tiles.</summary>
        public static bool IsInPointerRange(ToolData tool, TileData characterTile, TileData target) =>
            (target.Coordinates - characterTile.Coordinates).sqrMagnitude <= tool.pointerRange * tool.pointerRange;

        // Without a snapshot there is no pointer, so a live preview has no pointer target.
        private IEnumerable<TileData> PointerTarget(PlayerInteractionContextSnapshot snapshot)
        {
            var target = snapshot?.CurrentTileDataUnderPointer;
            var origin = snapshot?.TileUnderCharacter;
            if (target != null && origin != null && IsInPointerRange(ToolData, origin, target)) yield return target;
        }

        /// <summary>
        /// Gets captured targets during an attempt, or computes a live preview.
        /// </summary>
        public virtual List<TileData> GetAffectedTiles(PlayerInteractionContextSnapshot snapshot)
        {
            return _capturedAffectedTiles ?? ComputeAffectedTiles(snapshot);
        }

        /// <summary>
        /// Override to specify conditions for which tiles this tool can be used on.
        /// </summary>
        public virtual bool CanBeUsedOnTile(TileData tile)
        {
            return true;
        }

        /// <summary>
        /// Hides the tile highlighter. Call this at the start of your OnExecute override
        /// if you want to hide the preview when execution begins.
        /// </summary>
        public void HideTileHighlighter(PlayerInteractionContextSnapshot snapshot)
        {
            if (snapshot.Character.TileHighlighter) snapshot.Character.TileHighlighter.Hide();
        }

        /// <summary>
        /// Override to specify where the tool effect originates from.
        /// Default returns the first affected tile's position or the character's position.
        /// </summary>
        public override Vector2 GetActionExecutionLocation(PlayerInteractionContextSnapshot snapshot)
        {
            var affectedTiles = AffectedTiles;
            if (affectedTiles.Count > 0)
            {
                return affectedTiles[0].WorldPosition;
            }
            return snapshot.Character.transform.position;
        }

        /// <summary>
        /// Helper method to execute an action on each affected tile with optional delay.
        /// Uses the captured targets during an attempt.
        /// </summary>
        protected async Awaitable ForEachAffectedTile(
            PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation,
            Action<TileData> action, 
            float delayBetweenTiles = 0.2f)
        {
            var affectedTiles = AffectedTiles;
            foreach (var tile in affectedTiles)
            {
                cancellation.ThrowIfCancellationRequested();
                action(tile);
                cancellation.ThrowIfCancellationRequested();
                if (affectedTiles.Count > 1)
                {
                    await Awaitable.WaitForSecondsAsync(delayBetweenTiles, cancellation);
                }
            }
        }
        
    }
}
