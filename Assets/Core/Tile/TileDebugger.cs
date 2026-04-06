using Character;
using UnityEngine;

namespace Core.Tile
{
    public class TileDebugger : MonoBehaviour
    {
        private MapManager _mapManager;

        [SerializeField] private bool showCurrentTileInfos = true;

        [SerializeField] private int fontSize = 14;
        [SerializeField] private int rightPadding = 10;
        [SerializeField] private int topPadding = 10;
        [SerializeField] private int labelWidth = 220;
        [SerializeField] private int labelHeight = 24;
        [SerializeField] private Color textColor = Color.white;

        private void OnGUI()
        {
            if (!showCurrentTileInfos) return;
            if (!MainCharacter.CurrentMainCharacter) return;

            var currentTile = MainCharacter.CurrentMainCharacter.CurrentTileData;

            // Prepare rect anchored to top-right
            var rect = new Rect(Screen.width - labelWidth - rightPadding, topPadding, labelWidth, labelHeight);

            // Configure style
            var style = new GUIStyle(GUI.skin.label)
            {
                alignment = TextAnchor.UpperRight,
                fontSize = fontSize,
                normal = { textColor = textColor }
            };

            string text = $"Tile: {currentTile?.TerrainData.TerrainType}";
            GUI.Label(rect, text, style);
        }
    }
}