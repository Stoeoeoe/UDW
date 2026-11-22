using System.Linq;
using Core.Tile.Vulcanus;
using Core.TimeAndWeather;
using UnityEditor;
using UnityEditor.Overlays;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UIElements;

namespace Core.Tile.Editor
{
    /// <summary>
    /// A Scene view switch that previews maps in a season, through season twin tilesets. Objects show their base
    /// sprites while a scene is saved, so a preview never ends up in the scene.
    /// </summary>
    [UnityEditor.Overlays.Overlay(typeof(SceneView), "urdew-season", "Season", true)]
    internal sealed class SeasonOverlay : UnityEditor.Overlays.Overlay
    {
        private const string NoSeason = "No season";

        public override VisualElement CreatePanelContent()
        {
            var choices = new[] { NoSeason }.Concat(System.Enum.GetNames(typeof(Season))).ToList();
            var field = new DropdownField(choices, Label(TileSeason.Current)) { style = { minWidth = 110 } };
            field.RegisterValueChangedCallback(change =>
                Show(change.newValue == NoSeason ? null : System.Enum.Parse<Season>(change.newValue)));
            void Sync() => field.SetValueWithoutNotify(Label(TileSeason.Current));
            field.RegisterCallback<AttachToPanelEvent>(_ => TileSeason.Changed += Sync);
            field.RegisterCallback<DetachFromPanelEvent>(_ => TileSeason.Changed -= Sync);
            return field;
        }

        private static string Label(Season? season) => season?.ToString() ?? NoSeason;

        private static void Show(Season? season)
        {
            TileSeason.Set(season);
            ApplyObjects();
        }

        // Objects follow the season by themselves only while playing.
        private static void ApplyObjects()
        {
            foreach (var sprite in Object.FindObjectsByType<SeasonalSprite>(FindObjectsInactive.Include)) sprite.Apply();
        }

        [InitializeOnLoadMethod]
        private static void Initialize()
        {
            // A script reload forgets the previewed season; put back any objects still showing it.
            EditorApplication.delayCall += ApplyObjects;
            EditorSceneManager.sceneSaving += (_, _) =>
            {
                if (Application.isPlaying || TileSeason.Current == null) return;
                var previewed = TileSeason.Current;
                TileSeason.Set(null);
                ApplyObjects();
                EditorApplication.delayCall += () => Show(previewed);
            };
        }
    }
}
