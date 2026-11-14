using System;
using System.Collections;
using System.Linq;
using Character;
using Core.Common.Editor;
using Core.Location;
using Core.Tile;
using Core.TimeAndWeather;
using Interaction.Dialogue;
using NUnit.Framework;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;
using static Core.Common.Editor.Reflect;
using Object = UnityEngine.Object;

namespace Core.Routines.Editor
{
    /// <summary>
    /// Fabia's authored routine: from her home in the house she walks to a spot on map-1 with an activity, then back home.
    /// These tests watch map-1. Times and places are read from her timetable, so they follow edits to her routine file.
    /// </summary>
    public sealed class RoutinePresencePlayTests
    {
        private const string MapScene = "Assets/Scenes/Maps/map-1.unity";
        private const string Map = "base:map-1";
        private const string Fabia = "base:fabia";

        [UnityTest]
        public IEnumerator EnteringTheMapPlacesFabiaWhereHerTimetablePutsHer()
        {
            // The test runner only enters Play mode when the test itself yields this instruction.
            EditorSceneManager.OpenScene(MapScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return WaitForGame();
            var service = LiveGame.Get<RoutineNpcService>();
            var level = LiveGame.Get<LevelManager>();
            var day = FabiasDay(service);
            Assert.That(None(service), Is.True, "Before she sets off she is at home in the house.");

            // Partway along her walk on this map she is placed on her route, walking on.
            var walkIn = day.Segments.First(s => s.IsWalk && s.MapId == Map && s.Enters != null);
            SetTime(Mid(walkIn));
            var fabia = ReEnter(service, level);
            yield return null;
            yield return null;
            Assert.That(fabia.Controller.IsMovementOwned, Is.True, "She walks on.");
            Assert.That(Vector2.Distance(fabia.Graphics.position, Start(walkIn)), Is.GreaterThan(0.5f), "She is past the door she came in by.");
            Assert.That(fabia.GetComponentInChildren<ShowVulcanusDialogueInteractable>(true).DialogueId,
                Is.EqualTo(day.Plan.DialogueAt(walkIn.GoalIndex, arrived: false) ?? ""), "She says what her routine sets for the walk.");

            // During her stay she is at the spot with her activity.
            var stay = day.Segments.First(s => !s.IsWalk && s.MapId == Map);
            SetTime(Mid(stay));
            fabia = ReEnter(service, level);
            yield return null;
            yield return null; // The activity starts once she has entered the location.
            Assert.That(FeetDistance(fabia, stay.Place.AnchorId), Is.LessThan(0.05f));
            Assert.That(PoseActive(fabia), Is.True, "Her activity plays at the destination.");

            // Leaving the map removes her; nothing about her is saved.
            service.OnLocationLeave(level.CurrentLocationData);
            Assert.That(service.Characters, Is.Empty);
            yield return null;
            Assert.That(Object.FindObjectsByType<GameCharacter>(FindObjectsInactive.Include).Where(c => c.CharacterId == Fabia), Is.Empty);
        }

        [UnityTest]
        public IEnumerator FabiaComesInThroughADoorAndLeavesThroughOne()
        {
            EditorSceneManager.OpenScene(MapScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return WaitForGame();
            var service = LiveGame.Get<RoutineNpcService>();
            var day = FabiasDay(service);
            var walkIn = day.Segments.First(s => s.IsWalk && s.MapId == Map && s.Enters != null);
            var stay = day.Segments.First(s => !s.IsWalk && s.MapId == Map);
            var walkOut = day.Segments.First(s => s.IsWalk && s.MapId == Map && s.Leaves != null);

            // When her timetable brings her through the door, she fades in at its arrival anchor and walks to her spot.
            SetTime(Mathf.FloorToInt(walkIn.StartMinute));
            yield return WaitUntil(() => service.Characters.Any(), "She comes in while the player watches.");
            var fabia = Single(service);
            Assert.That(Vector2.Distance(fabia.Graphics.position, Start(walkIn)), Is.LessThan(0.5f), "She comes in at the door.");
            yield return WaitUntil(() => fabia.Controller.IsMovementOwned, "She walks on.");
            yield return WaitUntil(() => !fabia.Controller.IsMovementOwned && PoseActive(fabia), "She arrives and starts her activity.");
            Assert.That(FeetDistance(fabia, stay.Place.AnchorId), Is.LessThan(0.05f));
            Assert.That(Single(service), Is.SameAs(fabia), "She is the same character all along.");

            // When her stay ends she walks to the door she leaves by and fades out.
            SetTime((int)stay.EndMinute);
            yield return WaitUntil(() => fabia.Controller.IsMovementOwned, "She sets off home.");
            var last = Vector2.zero;
            yield return WaitUntil(() =>
            {
                if (fabia) last = fabia.Graphics.position;
                return None(service);
            }, "She leaves through the door.");
            Assert.That(Vector2.Distance(last, End(walkOut)), Is.LessThan(0.1f), "She fades out at the door.");
            yield return null;
            Assert.That(None(service), Is.True, "She isn't brought back while her timetable has her walking home.");
        }

        private static RoutineTimetable FabiasDay(RoutineNpcService service)
        {
            var day = service.Timetables.Single(each => each.Plan.Routine.CharacterId == Fabia);
            Assert.That(day.Plan.Routine.Home.MapId, Is.Not.EqualTo(Map), "These tests expect her to live on another map.");
            Assert.That(day.Segments.Count(s => !s.IsWalk && s.MapId == Map), Is.EqualTo(1), "She stays once on this map.");
            Assert.That(MinuteOfDay(), Is.LessThan(day.Plan.Goals[0].DepartMinute), "The game starts before her first departure.");
            Assert.That(day.Warnings, Is.Empty);
            return day;
        }

        private static int Mid(TimetableSegment segment) => Mathf.RoundToInt((segment.StartMinute + segment.EndMinute) / 2);

        private static Vector2 Start(TimetableSegment segment) => ToWorld(segment.Route[0]);

        private static Vector2 End(TimetableSegment segment) => ToWorld(segment.Route[^1]);

        private static Vector2 ToWorld(Vector2 local) => LiveGame.Get<MapManager>().CurrentMap.transform.TransformPoint(local);

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

        private static bool None(RoutineNpcService service) => !service.Characters.Any(character => character.CharacterId == Fabia);

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
