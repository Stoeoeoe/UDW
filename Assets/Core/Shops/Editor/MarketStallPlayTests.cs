using System.Collections;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Reflection;
using Core.Common.Editor;
using Core.Dialogue.Vulcanus;
using Core.Game;
using Core.Inventory;
using Core.Location;
using Core.Spawning;
using Interaction.Dialogue;
using Interaction.Shops;
using NUnit.Framework;
using UI.Shops;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;
using SessionState = UnityEditor.SessionState;

namespace Core.Shops.Editor
{
    /// <summary>The market stalls in the real game: new games start with money, seeds can be bought, beans sold and the screen opens.</summary>
    public sealed class MarketStallPlayTests
    {
        private const string HomeScene = "Assets/Scenes/Maps/indoor.unity";
        private const string FarmScene = "Assets/Scenes/Maps/map-1.unity";
        private const string SlotKey = "MarketStallPlayTests.Slot";

        [UnityTest]
        public IEnumerator SeedsCanBeBoughtAndBeansSoldAtAMarketStall()
        {
            EditorSceneManager.OpenScene(HomeScene, OpenSceneMode.Single);
            SessionState.SetString(SystemRoot.EditorNewGameKey, "Store playtest");
            yield return new EnterPlayMode();
            yield return WaitUntilReady();
            SessionState.SetString(SlotKey, LiveGame.Get<GameStateManager>().CurrentSlot);

            var player = LiveGame.Player;
            var startingMoney = LiveGame.Get<PlayerSettings>().startingMoney;
            Assert.That(player.Wallet.Balance, Is.EqualTo(startingMoney));

            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Content/Spawnables/MarketStall_bread.prefab");
            var stall = LiveGame.Get<WorldObjectSpawner>().Spawn(prefab.GetComponent<SpawnedObject>(),
                player.transform.position + Vector3.right * 2);
            yield return null;
            var shops = LiveGame.Get<ShopService>();
            var shop = shops.Require("base:market_seeds");

            var seeds = shops.GetOfferings(shop).Single();
            Assert.That(seeds.Item.Id, Is.EqualTo("base:broad_bean_seeds"));
            Assert.That(seeds.Price, Is.GreaterThan(0));
            Assert.That(shops.Buy(shop, seeds.Item.Id, player.Wallet, player.MainInventory, 2), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(player.Wallet.Balance, Is.EqualTo(startingMoney - 2 * seeds.Price));
            Assert.That(Count(player, seeds.Item.Id), Is.EqualTo(8), "Six starting seeds and the two bought.");

            var beans = AssetDatabase.LoadAssetAtPath<ItemDefinition>("Assets/Plants/BroadBeans/BroadBeansProduce.asset");
            Assert.That(player.MainInventory.AddItem(beans, 3), Is.True);
            var slot = player.MainInventory.GetSnapshot().ToList().FindIndex(stack => stack.IsOccupied && stack.ItemId == beans.Id);
            var balance = player.Wallet.Balance;
            Assert.That(shops.Sell(shop, slot, player.Wallet, player.MainInventory, 3), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(shops.GetSellPrice(beans), Is.GreaterThan(0));
            Assert.That(player.Wallet.Balance, Is.EqualTo(balance + 3 * shops.GetSellPrice(beans)));
            Assert.That(Count(player, beans.Id), Is.Zero);

            Assert.That(ShopUIDocumentPresenter.Instance, Is.Not.Null, "The shop screen is part of the game's systems.");
            stall.GetComponent<ShowShopInteractable>().TriggerInteraction(player);
            Assert.That(player.IsControlBlocked, Is.True, "Opening the shop screen pauses the character.");
            ShopUIDocumentPresenter.Instance.Close();
            Assert.That(player.IsControlBlocked, Is.False);
        }

        [UnityTest]
        public IEnumerator MapOneHasTheBreadStallWithItsShop()
        {
            EditorSceneManager.OpenScene(FarmScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return WaitUntilReady();

            var stall = Object.FindObjectsByType<ShowShopInteractable>(FindObjectsSortMode.None).Single();
            var shopId = (string)typeof(ShowShopInteractable).GetField("shopId", Private).GetValue(stall);
            Assert.That(shopId, Is.EqualTo("base:market_seeds"), "The placed stall's shop comes from the entity property.");
            Assert.That(stall.GetComponent<SpawnedObject>().PrefabId, Is.EqualTo("base:market_stall_bread"));
            Assert.That(stall.PersistentId, Is.EqualTo("market-stall-bread-01"));
            Assert.That(LiveGame.Get<ShopService>().GetOfferings(LiveGame.Get<ShopService>().Require(shopId)), Is.Not.Empty);
        }

        [UnityTest]
        public IEnumerator FabiaOpensHerShopFromTheDialogueChoice()
        {
            EditorSceneManager.OpenScene(FarmScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return WaitUntilReady();
            TalkToFabia();
            yield return ChooseOption("Show me your wares.");

            // The dialogue ends after its Lua action; the shop screen stays open for the player.
            yield return WaitUntil(() => !LiveGame.Get<VulcanusDialogueRunner>().IsDialogueActive, "The dialogue ends.");
            Assert.That(IsOpen(ShopUIDocumentPresenter.Instance), Is.True, "The shop screen is open.");
            Assert.That(LiveGame.Player.IsControlBlocked, Is.True);
            ShopUIDocumentPresenter.Instance.Close();
            Assert.That(LiveGame.Player.IsControlBlocked, Is.False);
        }

        [UnityTest]
        public IEnumerator FabiaCanBeChattedWithAndLeftWithoutOpeningTheShop()
        {
            EditorSceneManager.OpenScene(FarmScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return WaitUntilReady();
            TalkToFabia();
            yield return ChooseOption("Just wanted to chat.");
            yield return ChooseOption("Goodbye.");

            yield return WaitUntil(() => !LiveGame.Get<VulcanusDialogueRunner>().IsDialogueActive, "The dialogue ends.");
            Assert.That(IsOpen(ShopUIDocumentPresenter.Instance), Is.False, "Chatting does not open the shop.");
            Assert.That(LiveGame.Player.IsControlBlocked, Is.False);
        }

        // Her routine decides when she says the greeting; these tests are about the greeting's shop choice.
        private static void TalkToFabia()
        {
            var runner = LiveGame.Get<VulcanusDialogueRunner>();
            Assert.That(runner.StartDialogue("base:fabia_greeting", LiveGame.Player, UI.Shared.ScreenPauseMode.Character), Is.True);
            Assert.That(runner.IsDialogueActive, Is.True);
        }

        private static readonly BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;

        // Advances lines until the dialogue asks for a choice, then takes the option with this text.
        private static IEnumerator ChooseOption(string text)
        {
            var runner = LiveGame.Get<VulcanusDialogueRunner>();
            var presenter = Object.FindFirstObjectByType<VulcanusDialogueUIDocumentPresenter>();
            var type = typeof(VulcanusDialogueUIDocumentPresenter);
            var deadline = Time.realtimeSinceStartup + 20f;
            while (!(bool)type.GetField("_waitingForChoice", Private).GetValue(presenter))
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), $"The dialogue offers the choice '{text}'.");
                runner.TryAdvanceActiveDialogue();
                yield return null;
            }
            var options = (List<VulcanusDialogueChoiceOption>)type.GetField("_visibleOptions", Private).GetValue(presenter);
            type.GetMethod("SelectOption", Private).Invoke(presenter, new object[] { options.Single(each => each.Text == text) });
            yield return null;
        }

        private static bool IsOpen(UI.Shared.ManagedUIScreen screen) =>
            (bool)typeof(UI.Shared.ManagedUIScreen).GetProperty("IsManagedOpen", Private).GetValue(screen);

        private static IEnumerator WaitUntil(System.Func<bool> condition, string expectation)
        {
            var deadline = Time.realtimeSinceStartup + 20f;
            while (!condition())
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), expectation);
                LiveGame.Get<VulcanusDialogueRunner>().TryAdvanceActiveDialogue();
                yield return null;
            }
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

        private static int Count(Character.GameCharacter player, string itemId) => player.MainInventory.GetSnapshot()
            .Where(stack => stack.IsOccupied && stack.ItemId == itemId).Sum(stack => stack.Quantity);

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
        }
    }
}
