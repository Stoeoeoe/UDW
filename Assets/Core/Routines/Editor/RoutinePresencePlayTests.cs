using System;
using System.Collections;
using System.Linq;
using Character;
using Core.Common.Editor;
using Core.Location;
using Core.Tile;
using Core.TimeAndWeather;
using NUnit.Framework;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;
using static Core.Common.Editor.Reflect;
using Object = UnityEngine.Object;

namespace Core.Routines.Editor
{
    /// <summary>
    /// Fabia's authored routine on map-1: from home she goes to a destination with an activity, then back home.
    /// Times and places are read from her plan, so the tests follow edits to her routine file.
    /// </summary>
    public sealed class RoutinePresencePlayTests
    {
        private const string MapScene = "Assets/Scenes/Maps/map-1.unity";
        private const string Fabia = "base:fabia";

        [UnityTest]
        public IEnumerator EnteringTheMapPlacesFabiaWhereHerPlanPutsHer()
        {
            // The test runner only enters Play mode when the test itself yields this instruction.
            EditorSceneManager.OpenScene(MapScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return WaitForGame();
            var service = LiveGame.Get<RoutineNpcService>();
            var level = LiveGame.Get<LevelManager>();
            var (home, visit, goHome) = FabiasDay(service);

            // Before her first departure she is at home.
            var fabia = Single(service);
            yield return null; // She enters the location on her first frame.
            Assert.That(FeetDistance(fabia, home.AnchorId), Is.LessThan(0.05f));

            // Between her departures she has arrived and plays her activity.
            SetTime((visit.DepartMinute + goHome.DepartMinute) / 2);
            fabia = ReEnter(service, level);
            yield return null;
            yield return null; // The activity starts once she has entered the location.
            Assert.That(FeetDistance(fabia, visit.Destination.AnchorId), Is.LessThan(0.05f));
            Assert.That(PoseActive(fabia), Is.True, "Her activity plays at the destination.");

            // At the moment she sets off home she is still at the destination, walking, without her activity.
            SetTime(goHome.DepartMinute);
            fabia = ReEnter(service, level);
            yield return null;
            yield return null;
            Assert.That(FeetDistance(fabia, visit.Destination.AnchorId), Is.LessThan(0.5f));
            Assert.That(fabia.Controller.IsMovementOwned, Is.True, "She is walking home.");
            Assert.That(PoseActive(fabia), Is.False);

            // Leaving the map removes her; nothing about her is saved.
            service.OnLocationLeave(level.CurrentLocationData);
            Assert.That(service.Characters, Is.Empty);
            yield return null;
            Assert.That(Object.FindObjectsByType<GameCharacter>(FindObjectsInactive.Include).Where(c => c.CharacterId == Fabia), Is.Empty);
        }

        [UnityTest]
        public IEnumerator FabiaLivesThroughHerDayWhileThePlayerIsOnTheMap()
        {
            EditorSceneManager.OpenScene(MapScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return WaitForGame();
            var service = LiveGame.Get<RoutineNpcService>();
            var (home, visit, goHome) = FabiasDay(service);
            var fabia = Single(service);
            yield return null;
            Assert.That(FeetDistance(fabia, home.AnchorId), Is.LessThan(0.05f));

            // At her first departure she walks to her destination and starts her activity there.
            SetTime(visit.DepartMinute);
            yield return WaitUntil(() => fabia.Controller.IsMovementOwned, "She sets off at her first departure.");
            yield return WaitUntil(() => !fabia.Controller.IsMovementOwned && PoseActive(fabia), "She arrives and starts her activity.");
            Assert.That(FeetDistance(fabia, visit.Destination.AnchorId), Is.LessThan(0.05f));
            Assert.That(Single(service), Is.SameAs(fabia), "She is the same character all day.");

            // At her next departure she ends her activity and walks home.
            SetTime(goHome.DepartMinute);
            yield return WaitUntil(() => fabia.Controller.IsMovementOwned, "She sets off home.");
            yield return WaitUntil(() => !fabia.Controller.IsMovementOwned, "She arrives home.");
            Assert.That(FeetDistance(fabia, home.AnchorId), Is.LessThan(0.05f));
            Assert.That(PoseActive(fabia), Is.False, "Her day has no activity at home.");
        }

        /// <summary>Her home, the goal with an activity she visits, and the goal that takes her home again.</summary>
        private static (RoutinePlace Home, PlannedGoal Visit, PlannedGoal GoHome) FabiasDay(RoutineNpcService service)
        {
            var plan = service.Plans.Single(each => each.Routine.CharacterId == Fabia);
            Assert.That(plan.Goals.Count, Is.EqualTo(2), "These tests expect a day with a visit and a return home.");
            var (visit, goHome) = (plan.Goals[0], plan.Goals[1]);
            Assert.That(visit.ActivityAnimationId, Is.Not.Empty, "The visit has an activity.");
            Assert.That(goHome.Destination, Is.SameAs(plan.Routine.Home), "The second goal returns home.");
            Assert.That(goHome.DepartMinute - visit.DepartMinute, Is.GreaterThanOrEqualTo(2), "There is time between the departures.");
            Assert.That(MinuteOfDay(), Is.LessThan(visit.DepartMinute), "The game starts before her first departure.");
            return (plan.Routine.Home, visit, goHome);
        }

        private static int MinuteOfDay()
        {
            var time = LiveGame.Get<GameClock>().CurrentTime;
            return time.Hour * 60 + time.Minute;
        }

        private static void SetTime(int minuteOfDay) => LiveGame.Get<GameClock>().SetTimeOfDay(minuteOfDay / 60, minuteOfDay % 60);

        private static IEnumerator WaitForGame()
        {
            yield return WaitUntil(() => LiveGame.Get<LevelManager>() && LiveGame.Get<LevelManager>().SceneReady,
                "The game must finish initialization.");
        }

        private static IEnumerator WaitUntil(Func<bool> condition, string message, float seconds = 30f)
        {
            var deadline = Time.realtimeSinceStartup + seconds;
            while (!condition())
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), message);
                yield return null;
            }
        }

        private static GameCharacter ReEnter(RoutineNpcService service, LevelManager level)
        {
            service.OnLocationLeave(level.CurrentLocationData);
            service.OnLocationEnter(level.CurrentLocationData);
            return Single(service);
        }

        private static GameCharacter Single(RoutineNpcService service)
        {
            var characters = service.Characters.Where(character => character.CharacterId == Fabia).ToArray();
            Assert.That(characters, Has.Length.EqualTo(1), "The routine places exactly one Fabia.");
            return characters[0];
        }

        private static bool PoseActive(GameCharacter character) => Get<bool>(character.Animator, "_interactionAnimationActive");

        private static float FeetDistance(GameCharacter character, string anchorId)
        {
            Assert.That(LiveGame.Get<MapManager>().TryGetAnchor(anchorId, out var anchor), Is.True);
            return Vector2.Distance(character.Graphics.position, anchor.transform.position);
        }

        [UnityTearDown]
        public IEnumerator LeavePlayMode()
        {
            if (Application.isPlaying) yield return new ExitPlayMode();
        }
    }
}
