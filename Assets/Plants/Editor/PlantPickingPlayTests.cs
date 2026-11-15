using System.Collections;
using System.Linq;
using Core.Common.Editor;
using Core.Location;
using Core.Tile;
using NUnit.Framework;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;

namespace Plants.Editor
{
    /// <summary>Picking a ripe crop in the real game: the character plays the pickup animation, then the crop is harvested.</summary>
    public sealed class PlantPickingPlayTests
    {
        private const string FarmScene = "Assets/Tests/Scenes/map-1.unity";

        [UnityTest]
        public IEnumerator PickingARipeCropPlaysTheAnimationThenHarvestsIt()
        {
            EditorSceneManager.OpenScene(FarmScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            var deadline = Time.realtimeSinceStartup + 30f;
            while (!LiveGame.Get<LevelManager>() || !LiveGame.Get<LevelManager>().SceneReady)
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), "The game must finish initialization.");
                yield return null;
            }

            var player = LiveGame.Player;
            var plants = LiveGame.Get<PlantManager>();
            var locationId = LiveGame.Get<LevelManager>().CurrentLocationData.id;
            var position = LiveGame.Get<MapManager>().WorldToTileCoordinates(player.transform.position);
            plants.SowPlantOnCurrentMap(position, "base:broad_beans");
            plants.GetPlantState(locationId, position).daysPassedSincePlanting = 8;
            var picking = Object.FindObjectsByType<PlantHarvestInteractable>(FindObjectsSortMode.None).Single();

            picking.TriggerInteraction(player);
            Assert.That(player.IsControlBlocked, Is.True, "The character stands still while picking.");
            Assert.That(plants.HasPlantAt(locationId, position), Is.True, "The crop stays until the animation ends.");

            deadline = Time.realtimeSinceStartup + 10f;
            while (plants.HasPlantAt(locationId, position))
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), "The crop is picked when the animation ends.");
                yield return null;
            }
            var beans = player.MainInventory.GetSnapshot()
                .Where(stack => stack.IsOccupied && stack.ItemId == "base:broad_beans").Sum(stack => stack.Quantity);
            Assert.That(beans, Is.InRange(2, 4));
            Assert.That(player.IsControlBlocked, Is.False);
        }

        [UnityTearDown]
        public IEnumerator LeavePlayMode()
        {
            if (Application.isPlaying) yield return new ExitPlayMode();
        }
    }
}
