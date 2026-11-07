using System;
using System.Collections;
using System.IO;
using System.Linq;
using Core;
using Core.Common.Editor;
using Core.Game;
using Core.Location;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.UIElements;
using SessionState = UnityEditor.SessionState;

namespace UI.MainMenu.Editor
{
    /// <summary>Plays the real menu scene: starting a new game, and listing and deleting saves.</summary>
    public sealed class MainMenuPlayTests
    {
        private const string MenuScene = "Assets/Scenes/MainMenu.unity";
        private const string SlotsKey = "MainMenuPlayTests.Slots";
        private const string NameKey = "MainMenuPlayTests.Name";

        [UnityTest]
        public IEnumerator StartingANewGameFromTheMenuEntersTheGameAtHome()
        {
            SessionState.EraseString(SlotsKey);
            var saveName = "Menu test " + Guid.NewGuid().ToString("N");
            SessionState.SetString(NameKey, saveName);
            EditorSceneManager.OpenScene(MenuScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            for (var i = 0; i < 10; i++) yield return null;

            var root = Root();
            yield return Click(root.Q<Button>("newGameButton"));
            var start = root.Q<Button>("startButton");
            Assert.That(start.enabledSelf, Is.False, "A save needs a name.");
            root.Q<TextField>("saveNameField").value = SessionState.GetString(NameKey, "");
            Assert.That(start.enabledSelf, Is.True);
            yield return Click(start);

            var deadline = Time.realtimeSinceStartup + 60f;
            while (!LiveGame.Get<LevelManager>().SceneReady)
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), "The game must start after the menu.");
                yield return null;
            }

            var game = LiveGame.Get<GameStateManager>();
            SessionState.SetString(SlotsKey, game.CurrentSlot ?? "");
            Assert.That(game.CurrentSlot, Is.Not.Null);
            Assert.That(LiveGame.Get<GameState>().Data.saveName, Is.EqualTo(SessionState.GetString(NameKey, "")));
            Assert.That(LiveGame.Get<LevelManager>().CurrentLocationData.id,
                Is.EqualTo(LiveGame.Get<PlayerStateManager>().StartingHomeLocation.id));
        }

        [UnityTest]
        public IEnumerator ReturningToTheMenuFromTheGameAllowsStartingAgain()
        {
            SessionState.EraseString(SlotsKey);
            EditorSceneManager.OpenScene(MenuScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            for (var i = 0; i < 10; i++) yield return null;

            yield return StartNewGame(Root(), "Menu return " + Guid.NewGuid().ToString("N"));
            var level = LiveGame.Get<LevelManager>();

            var inventory = UnityEngine.Object.FindFirstObjectByType<InventoryScreen.UrInventoryUIDocumentPresenter>();
            inventory.OpenInventory();
            yield return null;
            Assert.That(inventory.Menu.SelectPage("settings"), Is.True);
            var gameRoot = inventory.GetComponent<UIDocument>().rootVisualElement;
            Assert.That(gameRoot.Q<Slider>("masterVolume"), Is.Not.Null, "The game menu has the volume sliders.");
            yield return Click(gameRoot.Q<Button>("returnToMenuButton"));
            Assert.That(level.SceneReady, Is.True, "Leaving the game asks for confirmation first.");
            yield return Click(gameRoot.Q<Button>("leaveGameButton"));

            var deadline = Time.realtimeSinceStartup + 60f;
            while (level.SceneReady || UnityEngine.Object.FindFirstObjectByType<MainMenu>() == null)
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), "The menu must come back.");
                yield return null;
            }
            for (var i = 0; i < 10; i++) yield return null;
            Assert.That(LiveGame.Get<CharacterManager>().MainCharacter, Is.Null, "The old player is gone.");

            yield return StartNewGame(Root(), "Menu again " + Guid.NewGuid().ToString("N"));
            Assert.That(LiveGame.Get<LevelManager>().SceneReady, Is.True);
        }

        // Starts a new game from the title screen and waits until its location is ready.
        private static IEnumerator StartNewGame(VisualElement root, string saveName)
        {
            yield return Click(root.Q<Button>("newGameButton"));
            root.Q<TextField>("saveNameField").value = saveName;
            yield return Click(root.Q<Button>("startButton"));
            var deadline = Time.realtimeSinceStartup + 60f;
            while (!LiveGame.Get<LevelManager>().SceneReady)
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), "The game must start after the menu.");
                yield return null;
            }
            SessionState.SetString(SlotsKey, SessionState.GetString(SlotsKey, "") + ";" + LiveGame.Get<GameStateManager>().CurrentSlot);
        }

        [UnityTest]
        public IEnumerator TheLoadListShowsEverySlotAndDeletesAfterConfirming()
        {
            var saves = new GameSaveService(Resources.Load<Character.CharacterCatalog>(Character.CharacterCatalog.ResourceName),
                Resources.Load<Core.Inventory.ItemCatalog>(Core.Inventory.ItemCatalog.ResourceName));
            var good = "test-" + Guid.NewGuid().ToString("N");
            var broken = "test-" + Guid.NewGuid().ToString("N");
            SessionState.SetString(SlotsKey, good + ";" + broken);
            var data = new GameSaveData { saveName = "Readable " + good };
            data.time.initialized = true;
            data.time.daysSinceStart = 2;
            data.time.dayOfSeason = 2;
            data.player.Home = new PlayerHomeState("test:home", "test-bed");
            data.session.LocationId = "test:farm";
            saves.Save(good, data);
            File.WriteAllText(GameSaveService.GetSavePath(broken), "not a save");

            EditorSceneManager.OpenScene(MenuScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return null;

            var root = Root();
            yield return Click(root.Q<Button>("loadGameButton"));
            var goodRow = Row(root, "Readable " + good);
            var brokenRow = Row(root, broken);
            Assert.That(goodRow.Query<Button>().ToList().Select(b => b.text), Is.EqualTo(new[] { "Load", "Delete" }));
            Assert.That(brokenRow.Query<Button>().ToList().Select(b => b.text), Is.EqualTo(new[] { "Delete" }),
                "An unreadable save can only be deleted.");

            yield return Click(brokenRow.Query<Button>().ToList().Single());
            Assert.That(File.Exists(GameSaveService.GetSavePath(broken)), Is.True, "Delete asks for confirmation first.");
            var choices = brokenRow.Query<Button>().ToList();
            Assert.That(choices.Select(b => b.text), Is.EqualTo(new[] { "Delete", "Keep" }));
            yield return Click(choices[1]);
            Assert.That(File.Exists(GameSaveService.GetSavePath(broken)), Is.True);

            yield return Click(brokenRow.Query<Button>().ToList().Single());
            yield return Click(brokenRow.Query<Button>().ToList()[0]);
            Assert.That(File.Exists(GameSaveService.GetSavePath(broken)), Is.False);
            Assert.That(root.Query<Label>(className: "main-menu-slot-name").ToList().Select(l => l.text),
                Does.Not.Contain(broken));
            yield return null;
        }

        [UnityTest]
        public IEnumerator SettingsVolumeChangesApplyAndAreSavedWhenLeaving()
        {
            EditorSceneManager.OpenScene(MenuScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return null;

            var sound = MoreMountains.Tools.MMSoundManager.Current;
            var original = sound.settingsSo.Settings.MusicVolume;
            var root = Root();
            yield return Click(root.Q<Button>("settingsButton"));
            var slider = root.Q<Slider>("musicVolume");
            Assert.That(slider.value, Is.EqualTo(original).Within(0.01f), "The slider shows the current volume.");

            slider.value = 0.35f;
            Assert.That(sound.settingsSo.Settings.MusicVolume, Is.EqualTo(0.35f).Within(0.001f));
            yield return Click(root.Q<Button>("settingsBackButton"));

            var saved = (MoreMountains.Tools.MMSoundManagerSettings)MoreMountains.Tools.MMSaveLoadManager.Load(
                typeof(MoreMountains.Tools.MMSoundManagerSettings), "mmsound.settings", "MMSoundManager/");
            Assert.That(saved.MusicVolume, Is.EqualTo(0.35f).Within(0.001f), "Leaving the screen saves the settings.");

            sound.SetVolumeMusic(original);
            sound.SaveSettings();
        }

        private static VisualElement Root() => UnityEngine.Object.FindFirstObjectByType<MainMenu>().GetComponent<UIDocument>().rootVisualElement;

        private static VisualElement Row(VisualElement root, string name) =>
            root.Query<VisualElement>(className: "main-menu-slot")
                .Where(row => row.Q<Label>(className: "main-menu-slot-name").text == name).First();

        // A keyboard submit fires the button after a short delay, so the caller waits for it.
        private static IEnumerator Click(Button button)
        {
            using (var submit = NavigationSubmitEvent.GetPooled())
            {
                submit.target = button;
                button.SendEvent(submit);
            }
            yield return new WaitForSecondsRealtime(0.3f);
        }

        [UnityTearDown]
        public IEnumerator LeavePlayModeAndDeleteTheSlots()
        {
            if (Application.isPlaying) yield return new ExitPlayMode();
            var slots = SessionState.GetString(SlotsKey, "").Split(';', StringSplitOptions.RemoveEmptyEntries);
            foreach (var slot in slots)
            {
                var path = GameSaveService.GetSavePath(slot);
                foreach (var file in new[] { path, path + ".bak", path.Replace(".json", ".meta.json") })
                    File.Delete(file);
            }
            SessionState.EraseString(SlotsKey);
            SessionState.EraseString(NameKey);
        }
    }
}
