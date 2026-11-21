using System;
using System.Collections;
using System.IO;
using System.Linq;
using Core.Common.Editor;
using Core.Game;
using Core.TimeAndWeather;
using Interaction;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;
using SessionState = UnityEditor.SessionState;

namespace Core.Location.Editor
{
    /// <summary>Starts the real game as a new game: it wakes up at the home bed and writes its slot once ready.</summary>
    public sealed class NewGamePlayTests
    {
        private const string FirstMap = "Assets/Scenes/Maps/map-1.unity";
        private const string SlotKey = "NewGamePlayTests.Slot";
        private const string HomeKey = "NewGamePlayTests.Home";
        private const string HomeSceneKey = "NewGamePlayTests.HomeScene";
        private const string BedKey = "NewGamePlayTests.Bed";
        private const string DayKey = "NewGamePlayTests.Day";

        [UnityTest]
        public IEnumerator ANewGameWakesUpAtTheHomeBedAndSavesItsSlot()
        {
            SessionState.EraseString(SlotKey);

            // A first, ordinary start reads the authored home and start date from the running game.
            EditorSceneManager.OpenScene(FirstMap, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return WaitUntilReady();
            var players = LiveGame.Get<PlayerStateManager>();
            SessionState.SetString(HomeKey, players.StartingHomeLocation.Id);
            SessionState.SetString(HomeSceneKey, players.StartingHomeLocation.ScenePath);
            SessionState.SetString(BedKey, players.StartingBedId);
            SessionState.SetInt(DayKey, LiveGame.Get<ClockSettings>().startingDay);
            yield return new ExitPlayMode();

            // The new game then starts from the home scene.
            EditorSceneManager.OpenScene(SessionState.GetString(HomeSceneKey, ""), OpenSceneMode.Single);
            SessionState.SetString(SystemRoot.EditorNewGameKey, "Playtest farm");
            yield return new EnterPlayMode();
            yield return WaitUntilReady();

            var homeId = SessionState.GetString(HomeKey, "");
            var bedId = SessionState.GetString(BedKey, "");
            var startingDay = SessionState.GetInt(DayKey, 0);
            var game = LiveGame.Get<GameStateManager>();
            SessionState.SetString(SlotKey, game.CurrentSlot ?? "");
            Assert.That(game.CurrentSlot, Is.Not.Null);
            Assert.That(LiveGame.Get<LevelManager>().CurrentLocationData.Id, Is.EqualTo(homeId), "A new game starts at the authored home.");
            var bed = UnityEngine.Object.FindObjectsByType<Bed>(FindObjectsSortMode.None).Single(b => b.PersistentId == bedId);
            // The bed's pivot is a corner of its sprite, so the player is measured from the middle of the bed.
            Assert.That(Vector2.Distance(LiveGame.Player.transform.position, bed.GetComponent<Collider2D>().bounds.center), Is.LessThan(3.5f));

            Assert.That(game.Time.daysSinceStart, Is.EqualTo(1));
            Assert.That(game.Time.dayOfSeason, Is.EqualTo(startingDay));

            Assert.That(LiveGame.Get<GameSaveService>().TryLoad(game.CurrentSlot, out var saved), Is.True,
                "The slot is written as soon as the first location is ready.");
            Assert.That(saved.saveName, Is.EqualTo("Playtest farm"));
            Assert.That(saved.session.LocationId, Is.EqualTo(homeId));
            Assert.That(SessionState.GetString(SystemRoot.EditorNewGameKey, ""), Is.Empty, "A new-game request is used once.");
        }

        private static IEnumerator WaitUntilReady()
        {
            var deadline = Time.realtimeSinceStartup + 30f;
            while (!LiveGame.Get<LevelManager>() || !LiveGame.Get<LevelManager>().SceneReady)
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), "The game must finish initialization.");
                yield return null;
            }
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
            SessionState.EraseString(SystemRoot.EditorNewGameKey);
            foreach (var key in new[] { HomeKey, HomeSceneKey, BedKey, DayKey }) SessionState.EraseString(key);
        }
    }
}
