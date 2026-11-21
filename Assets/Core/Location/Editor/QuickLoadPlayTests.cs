using Core.Location;
using Core.Catalogs;
using System;
using System.Collections;
using System.IO;
using System.Linq;
using Character;
using Core.Common.Editor;
using Core.Game;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;
using SessionState = UnityEditor.SessionState;
using static Core.Common.Editor.Reflect;

namespace Core.Location.Editor
{
    /// <summary>Quick loads the real running game: in the same map and from a different one, with a freshly created player.</summary>
    public sealed class QuickLoadPlayTests
    {
        private const string MapScene = "Assets/Scenes/Maps/map-1.unity";
        private const string SlotKey = "QuickLoadPlayTests.Slot";

        [UnityTest]
        public IEnumerator QuickLoadReplacesTheRunningGameInTheSameAndInAnotherLocation()
        {
            SessionState.EraseString(SlotKey);
            EditorSceneManager.OpenScene(MapScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return WaitUntilFree(null);

            var game = LiveGame.Get<GameStateManager>();
            var slot = "test-" + Guid.NewGuid().ToString("N");
            SessionState.SetString(SlotKey, slot);
            Set(game, "_quickSaveSlot", slot); // The developer's real quick save must not be touched.

            var level = LiveGame.Get<LevelManager>();
            var start = level.CurrentLocationData;
            var saveLocation = LiveGame.Get<DefinitionCatalog>().All<LocationData>()
                .First(location => location.Id != start.Id &&
                                   location.ScenePath.StartsWith("Assets/Scenes/Maps/", StringComparison.Ordinal));
            Assert.That(level.LoadLocation(saveLocation, null, Vector2.down), Is.True);
            yield return WaitUntilFree(() => level.CurrentLocationData.Id == saveLocation.Id);

            // Save here, then change the world and the player.
            var player = LiveGame.Player;
            player.transform.position += new Vector3(1.5f, 0f, 0f);
            player.Orientation.ForceDirection(Vector2.left);
            var savedPosition = (Vector2)player.transform.position;
            game.Story.Set("test:marker", "before");
            Assert.That(game.QuickSave(), Is.True);
            Assert.That(game.CurrentSlot, Is.Null, "Quick save never becomes the current slot.");
            game.Story.Set("test:marker", "after");
            player.transform.position += new Vector3(3f, 0f, 0f);

            // Same location: the player is replaced and the saved state and placement come back.
            Assert.That(game.QuickLoad(), Is.True);
            yield return WaitUntilReloaded(player);
            AssertRestored(game, saveLocation, savedPosition);
            Assert.That(player == null, Is.True, "The old player is destroyed.");

            // Different location: the saved map replaces the one that is open.
            var replaced = LiveGame.Player;
            Assert.That(level.LoadLocation(start, null, Vector2.down), Is.True);
            yield return WaitUntilFree(() => level.CurrentLocationData.Id == start.Id);
            replaced = LiveGame.Player;
            game.Story.Set("test:marker", "after");
            Assert.That(game.QuickLoad(), Is.True);
            yield return WaitUntilReloaded(replaced);
            AssertRestored(game, saveLocation, savedPosition);
            Assert.That(game.CurrentSlot, Is.Null);
        }

        private static void AssertRestored(GameStateManager game, LocationData location, Vector2 position)
        {
            Assert.That(LiveGame.Get<LevelManager>().CurrentLocationData.Id, Is.EqualTo(location.Id));
            Assert.That(game.Story.Get<string>("test:marker"), Is.EqualTo("before"));
            Assert.That(Vector2.Distance(LiveGame.Player.transform.position, position), Is.LessThan(0.05f));
            Assert.That(LiveGame.Player.Orientation.FacingDirection, Is.EqualTo(Vector2.left));
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
        }

        private static IEnumerator WaitUntilReloaded(MainCharacter oldPlayer)
        {
            var deadline = Time.realtimeSinceStartup + 30f;
            while (LiveGame.Player == oldPlayer || !LiveGame.Get<GameStateManager>().CanSaveOrLoadNow)
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), "The reload must finish and create a new player.");
                yield return null;
            }
        }

        private static IEnumerator WaitUntilFree(Func<bool> extra)
        {
            var deadline = Time.realtimeSinceStartup + 30f;
            while (!LiveGame.Get<LevelManager>() || !LiveGame.Get<GameStateManager>().CanSaveOrLoadNow || extra != null && !extra())
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), "The playable map must finish initialization.");
                yield return null;
            }
        }
    }
}
