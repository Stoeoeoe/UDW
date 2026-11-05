using System;
using System.Collections;
using System.Globalization;
using System.IO;
using System.Linq;
using Core.Common.Editor;
using Core.Game;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;
using SessionState = UnityEditor.SessionState;

namespace Core.Location.Editor
{
    /// <summary>Starts the real game twice: save in another map, then start from that save while a different map is open.</summary>
    public sealed class SavedGameStartPlayTests
    {
        private const string MapScene = "Assets/Scenes/Maps/map-1.unity";
        private const string SlotKey = "SavedGameStartPlayTests.Slot";
        private const string LocationKey = "SavedGameStartPlayTests.Location";
        private const string PlacementKey = "SavedGameStartPlayTests.Placement";

        [UnityTest]
        public IEnumerator PlayStartsInTheSavedLocationAtTheSavedPlacement()
        {
            SessionState.EraseString(SlotKey);
            SessionState.EraseString(SystemRoot.EditorStartSlotKey);
            EditorSceneManager.OpenScene(MapScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return WaitUntilReady(null);

            // Save in a different map than the one that will be open when the game starts again.
            var level = LiveGame.Get<LevelManager>();
            var other = LiveGame.Get<LocationCatalog>().EnabledDefinitions
                .First(location => location.id != level.CurrentLocationData.id &&
                                   location.ScenePath.StartsWith("Assets/Scenes/Maps/", StringComparison.Ordinal));
            Assert.That(level.LoadLocation(other, null, Vector2.down), Is.True);
            yield return WaitUntilReady(() => level.CurrentLocationData.id == other.id);

            var player = LiveGame.Player;
            player.transform.position += new Vector3(1.5f, 0f, 0f);
            player.Orientation.ForceDirection(Vector2.left);
            var slot = "test-" + Guid.NewGuid().ToString("N");
            LiveGame.Get<GameStateManager>().Save(slot);
            SessionState.SetString(SlotKey, slot);
            SessionState.SetString(LocationKey, other.id);
            SessionState.SetString(PlacementKey, string.Join(",", new[] { player.transform.position.x, player.transform.position.y }
                .Select(value => value.ToString("R", CultureInfo.InvariantCulture))));

            yield return new ExitPlayMode();
            EditorSceneManager.OpenScene(MapScene, OpenSceneMode.Single);
            SessionState.SetString(SystemRoot.EditorStartSlotKey, SessionState.GetString(SlotKey, ""));
            yield return new EnterPlayMode();
            yield return WaitUntilReady(null);

            var expected = SessionState.GetString(PlacementKey, "").Split(',')
                .Select(value => float.Parse(value, CultureInfo.InvariantCulture)).ToArray();
            Assert.That(LiveGame.Get<LevelManager>().CurrentLocationData.id, Is.EqualTo(SessionState.GetString(LocationKey, "")));
            Assert.That(Vector2.Distance(LiveGame.Player.transform.position, new Vector2(expected[0], expected[1])), Is.LessThan(0.05f));
            Assert.That(LiveGame.Player.Orientation.FacingDirection, Is.EqualTo(Vector2.left));
            Assert.That(LiveGame.Get<GameStateManager>().CurrentSlot, Is.EqualTo(SessionState.GetString(SlotKey, "")));
            Assert.That(SessionState.GetString(SystemRoot.EditorStartSlotKey, ""), Is.Empty, "A start request is used once.");
        }

        [UnityTearDown]
        public IEnumerator LeavePlayModeAndDeleteTheSlot()
        {
            if (Application.isPlaying) yield return new ExitPlayMode();
            var slot = SessionState.GetString(SlotKey, "");
            if (slot != "")
            {
                var path = GameSaveService.GetSavePath(slot);
                foreach (var file in new[] { path, path + ".bak", path.Replace(".json", ".meta.json") })
                    File.Delete(file);
            }
            SessionState.EraseString(SlotKey);
            SessionState.EraseString(LocationKey);
            SessionState.EraseString(PlacementKey);
            SessionState.EraseString(SystemRoot.EditorStartSlotKey);
        }

        private static IEnumerator WaitUntilReady(Func<bool> extra)
        {
            var deadline = Time.realtimeSinceStartup + 20f;
            while (!LiveGame.Get<LevelManager>() || !LiveGame.Get<LevelManager>().SceneReady || extra != null && !extra())
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), "The playable map must finish initialization.");
                yield return null;
            }
        }
    }
}
