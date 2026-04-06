using System.Collections.Generic;
using Core.Context;
using UnityEngine;

namespace Core.Tile.Overlay
{
    /// <summary>
    /// Base class for tile overlays. Subclass this to create specific overlay behaviors
    /// (e.g., PlantSeedOverlay, IrrigationOverlay, etc.)
    /// </summary>
    public abstract class AbstractOverlay : MonoBehaviour
    {
        /// <summary>
        /// Whether this overlay should be active given the current context.
        /// Override to control when the overlay appears.
        /// </summary>
        public abstract bool ShouldShow(PlayerInteractionContextSnapshot snapshot);

        /// <summary>
        /// Evaluate the given tiles and return overlay results.
        /// Each result contains the tile to display (or null to hide) and optional data.
        /// </summary>
        public abstract IEnumerable<OverlayTileResult> Evaluate(
            IEnumerable<TileData> tiles,
            PlayerInteractionContextSnapshot snapshot
        );

        /// <summary>
        /// Optional: Get the tiles to evaluate. By default, uses tiles around the cursor.
        /// Override for custom tile selection (e.g., all farmland tiles for irrigation preview).
        /// </summary>
        public virtual IEnumerable<TileData> GetTilesToEvaluate(PlayerInteractionContextSnapshot snapshot)
        {
            return null; // null means "use default from manager"
        }
    }
}