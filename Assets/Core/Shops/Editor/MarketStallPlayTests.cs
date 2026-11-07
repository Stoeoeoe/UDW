using System.Collections;
using System.IO;
using System.Linq;
using Core.Common.Editor;
using Core.Game;
using Core.Inventory;
using Core.Location;
using Core.Spawning;
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
            var shop = stall.GetComponent<Shop>();

            var seeds = shop.GetOfferings().Single();
            Assert.That(seeds.Item.ItemId, Is.EqualTo("base:broad_bean_seeds"));
            Assert.That(seeds.Quantity, Is.EqualTo(10));
            Assert.That(seeds.UnitPrice, Is.GreaterThan(0));
            Assert.That(shop.Buy(seeds.OfferingId, player.Wallet, player.MainInventory, 2), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(player.Wallet.Balance, Is.EqualTo(startingMoney - 2 * seeds.UnitPrice));
            Assert.That(Count(player, seeds.Item.ItemId), Is.EqualTo(8), "Six starting seeds and the two bought.");

            var beans = AssetDatabase.LoadAssetAtPath<ItemDefinition>("Assets/Plants/BroadBeans/BroadBeansProduce.asset");
            Assert.That(player.MainInventory.AddItem(beans, 3), Is.True);
            var slot = player.MainInventory.GetSnapshot().ToList().FindIndex(stack => stack.IsOccupied && stack.ItemId == beans.ItemId);
            var balance = player.Wallet.Balance;
            Assert.That(shop.Sell(slot, player.Wallet, player.MainInventory, 3), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(shop.GetSellPrice(beans), Is.GreaterThan(0));
            Assert.That(player.Wallet.Balance, Is.EqualTo(balance + 3 * shop.GetSellPrice(beans)));
            Assert.That(Count(player, beans.ItemId), Is.Zero);

            Assert.That(ShopUIDocumentPresenter.Instance, Is.Not.Null, "The shop screen is part of the game's systems.");
            stall.GetComponent<ShowShopInteractable>().TriggerInteraction(player);
            Assert.That(player.IsControlBlocked, Is.True, "Opening the shop screen pauses the character.");
            ShopUIDocumentPresenter.Instance.Close();
            Assert.That(player.IsControlBlocked, Is.False);
        }

        [UnityTest]
        public IEnumerator MapOneHasTheBreadStallWithItsOwnShop()
        {
            EditorSceneManager.OpenScene(FarmScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return WaitUntilReady();

            var shop = Object.FindObjectsByType<Shop>(FindObjectsSortMode.None).Single();
            Assert.That(shop.Id, Is.EqualTo("base:market_stall_bread_01"), "The placed stall's shop ID comes from the entity property.");
            Assert.That(shop.GetComponent<SpawnedObject>().PrefabId, Is.EqualTo("base:market_stall_bread"));
            Assert.That(shop.GetComponent<ShowShopInteractable>().PersistentId, Is.EqualTo("market-stall-bread-01"));
            Assert.That(shop.GetOfferings(), Is.Not.Empty);
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
