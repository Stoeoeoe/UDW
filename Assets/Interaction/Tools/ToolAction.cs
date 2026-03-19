using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Context;
using Core.Tile;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Interaction.Tools
{
    /// <summary>
    /// A specialized AbstractAction for tools that work on tiles.
    /// Combines the lifecycle management of AbstractAction with tile-based functionality.
    /// Settings like cooldown and freeze duration are derived from ToolData.
    /// </summary>
    public abstract class ToolAction : AbstractAction
    {
        [PropertyOrder(-10)]
        [Header("Tool Settings")]
        [field: SerializeField] public ToolData ToolData { get; private set; }
        
        [PropertyOrder(-9)]
        [field: SerializeField] public bool ExecuteFeedbackPerAffectedTile { get; private set; }
        
        
        /// <summary>
        /// Whether this tool has a preparation phase or should be executed immediately.
        /// Defaults to true for tools.
        /// </summary>
        [PropertyOrder(-8)]
        [field: SerializeField] public bool HasToolPreparationPhase { get; private set; } = true;
        
        // Override base virtual properties - tools get values from ToolData
        public override float CooldownTime => ToolData != null ? ToolData.cooldownDuration : 0f;
        public override bool HasPreparationPhase => HasToolPreparationPhase;
        public override bool FreezeCharacterDuringAction => true; // Tools currently always freeze character
        

        protected UrCharacter Character => Owner;
        protected TileData CurrentTileData => Character?.CurrentTileData;
        protected TileData TileDataInFront => Character?.TileDataInFront;
        protected TileData TileDataInBack => Character?.TileDataInBack;

        // Cached affected tiles for the current action execution
        private List<TileData> _cachedAffectedTiles;
        
        /// <summary>
        /// Gets the cached affected tiles. Call CacheAffectedTiles first to populate.
        /// Falls back to computing if not cached.
        /// </summary>
        public List<TileData> AffectedTiles => _cachedAffectedTiles ?? ComputeAffectedTiles();

        /// <summary>
        /// Computes and caches the affected tiles for this action execution.
        /// Called at the start of the action lifecycle.
        /// </summary>
        public void CacheAffectedTiles(PlayerInteractionContextSnapshot snapshot)
        {
            _cachedAffectedTiles = ComputeAffectedTiles(snapshot);
        }

        /// <summary>
        /// Clears the cached affected tiles. Called at the end of the action lifecycle.
        /// </summary>
        public void ClearCachedTiles()
        {
            _cachedAffectedTiles = null;
        }

        /// <summary>
        /// Computes the tiles affected by this tool based on the tool's effect configuration.
        /// Override to customize which tiles are affected.
        /// </summary>
        private List<TileData> ComputeAffectedTiles(PlayerInteractionContextSnapshot snapshot = null)
        {
            if (ToolData?.toolEffectConfiguration == null) 
                return new List<TileData>();
            
            return MapManager.Current
                .GetTilesFromEffectConfiguration(Character, ToolData.toolEffectConfiguration)
                .Where(CanBeUsedOnTile)
                .ToList();
        }

        /// <summary>
        /// Gets the tiles affected by this tool. Uses cache if available.
        /// </summary>
        public virtual List<TileData> GetAffectedTiles(PlayerInteractionContextSnapshot snapshot)
        {
            return _cachedAffectedTiles ?? ComputeAffectedTiles(snapshot);
        }

        /// <summary>
        /// Override to specify conditions for which tiles this tool can be used on.
        /// </summary>
        public virtual bool CanBeUsedOnTile(TileData tile)
        {
            return true;
        }

        /// <summary>
        /// Default prepare behavior: shows affected tiles highlight.
        /// </summary>
        public override IEnumerator OnPrepare(PlayerInteractionContextSnapshot snapshot)
        {
            yield break;
        }

        /// <summary>
        /// Override to specify what happens when the tool action finishes.
        /// </summary>
        public override IEnumerator OnFinish(PlayerInteractionContextSnapshot snapshot)
        {
            // Default: hide the tile highlighter in case it wasn't hidden
            snapshot.Character.TileHighlighter?.Hide();
            yield break;
        }
        
        /// <summary>
        /// Hides the tile highlighter. Call this at the start of your OnExecute override
        /// if you want to hide the preview when execution begins.
        /// </summary>
        public void HideTileHighlighter(PlayerInteractionContextSnapshot snapshot)
        {
            snapshot.Character.TileHighlighter?.Hide();
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
        /// Uses cached tiles if available.
        /// </summary>
        protected IEnumerator ForEachAffectedTile(
            PlayerInteractionContextSnapshot snapshot, 
            System.Action<TileData> action, 
            float delayBetweenTiles = 0.2f)
        {
            var affectedTiles = AffectedTiles;
            foreach (var tile in affectedTiles)
            {
                action(tile);
                if (affectedTiles.Count > 1)
                {
                    yield return new WaitForSeconds(delayBetweenTiles);
                }
            }
        }
        
        /// <summary>
        /// Helper method to execute an async action on each affected tile with optional delay.
        /// Uses cached tiles if available.
        /// </summary>
        protected IEnumerator ForEachAffectedTileAsync(
            PlayerInteractionContextSnapshot snapshot, 
            System.Func<TileData, IEnumerator> action, 
            float delayBetweenTiles = 0.2f)
        {
            var affectedTiles = AffectedTiles;
            foreach (var tile in affectedTiles)
            {
                yield return action(tile);
                if (affectedTiles.Count > 1)
                {
                    yield return new WaitForSeconds(delayBetweenTiles);
                }
            }
        }
    }
}
