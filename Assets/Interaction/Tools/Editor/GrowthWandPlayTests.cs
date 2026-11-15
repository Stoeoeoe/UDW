using System.Collections;
using System.Linq;
using Core.Common.Editor;
using Core.Context;
using Core.Location;
using Core.Tile;
using NUnit.Framework;
using Plants;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;

namespace Interaction.Tools.Editor
{
    /// <summary>The growth wand through the real tool system: selected from the toolbelt, aimed with the pointer, paid for in stamina.</summary>
    public sealed class GrowthWandPlayTests
    {
        private const string FarmScene = "Assets/Scenes/Maps/map-1.unity";
        private const string BeanId = "base:broad_beans";

        [UnityTest]
        public IEnumerator TheWandAdvancesACropUnderThePointerForItsStaminaCost()
        {
            EditorSceneManager.OpenScene(FarmScene, UnityEditor.SceneManagement.OpenSceneMode.Single);
            yield return new EnterPlayMode();
            var deadline = Time.realtimeSinceStartup + 30f;
            while (!LiveGame.Get<LevelManager>() || !LiveGame.Get<LevelManager>().SceneReady)
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), "The game must finish initialization.");
                yield return null;
            }

            var player = LiveGame.Player;
            var plants = LiveGame.Get<PlantManager>();
            var map = LiveGame.Get<MapManager>();
            var locationId = LiveGame.Get<LevelManager>().CurrentLocationData.id;
            var characterTile = map.GetTileDataAtWorldPosition(player.transform.position);
            var cropTile = map.GetTileDataAtCoordinates(characterTile.Coordinates + Vector2Int.right);
            plants.SowPlantOnCurrentMap(cropTile.Coordinates, BeanId);

            var loadout = player.MainInventory.Loadout;
            var slot = Enumerable.Range(0, 10).First(i => loadout.GetToolbeltTool(i)?.ItemId == "base:growth_wand");
            Assert.That(loadout.SelectToolbeltSlot(slot), Is.True);
            Assert.That(player.CurrentTool.StaminaCost, Is.EqualTo(10));
            var farTile = map.GetTileDataAtCoordinates(characterTile.Coordinates + Vector2Int.right * (player.CurrentTool.PointerRange + 1));

            var use = player.GetComponentInChildren<UseToolAction>(true);
            PlayerInteractionContextSnapshot Aim(TileData target) => PlayerInteractionContextSnapshot.Create(true, player, null,
                target, null, characterTile, player.CurrentTool, player.CurrentlyHeldItem, null, null, null, default);

            Assert.That(use.CanExecute(Aim(farTile)), Is.False, "Only crops can be targeted.");
            Assert.That(use.CanExecute(Aim(characterTile)), Is.False, "Only crops can be targeted.");
            Assert.That(use.CanExecute(Aim(cropTile)), Is.True);

            var stamina = player.Stamina.CurrentStamina;
            var snapshot = Aim(cropTile);
            Assert.That(use.CanExecuteAfterPreparation(snapshot), Is.True);
            _ = use.OnPrepare(snapshot, default); // Activates the action, as the real attempt does.
            _ = use.OnExecute(snapshot, default);
            var sparkles = player.ToolActionRegistry.GetToolAction("base:growth_wand").ExecuteFeedback.GetComponentInChildren<ParticleSystem>(true);
            yield return null; // Particles are emitted on the next simulation step.
            Assert.That(sparkles.particleCount, Is.GreaterThan(0), "Casting plays the sparkle effect.");
            use.OnEnd(snapshot);

            Assert.That(plants.GetPlantState(locationId, cropTile.Coordinates).daysPassedSincePlanting, Is.EqualTo(2));
            Assert.That(stamina - player.Stamina.CurrentStamina, Is.EqualTo(10));
        }

        [UnityTearDown]
        public IEnumerator LeavePlayMode()
        {
            if (Application.isPlaying) yield return new ExitPlayMode();
        }
    }
}
