using System;
using Character;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;

namespace Core.Tile
{
    public class TileDebugger : MonoBehaviour, MMEventListener<TopDownEngineEvent>
    {
        private MapManager _mapManager;
        private UrCharacter _currentCharacter;

        [SerializeField] private bool showCurrentTileInfos = true;

        [SerializeField] private int fontSize = 14;
        [SerializeField] private int rightPadding = 10;
        [SerializeField] private int topPadding = 10;
        [SerializeField] private int labelWidth = 220;
        [SerializeField] private int labelHeight = 24;
        [SerializeField] private Color textColor = Color.white;

        private void Awake()
        {
            // this._tileManager = TileManager.Instance;
            // _currentCharacter ??= MainCharacter.CurrentMainCharacter;
        }


        private void OnGUI()
        {
            if (!showCurrentTileInfos) return;
            if (!_currentCharacter) return;

            var currentTile = _currentCharacter.CurrentTileData;

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

        public void OnMMEvent(TopDownEngineEvent eventType)
        {
            if (_currentCharacter) return;
            
            if (eventType.EventType == TopDownEngineEventTypes.SpawnComplete)
            {
                _currentCharacter = eventType.OriginCharacter as UrCharacter;
            }
        }
        
        

        protected virtual void OnEnable() => this.MMEventStartListening();
        protected virtual void OnDisable() => this.MMEventStopListening();
    }
}