using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Common.Editor;
using Core.Location;
using Core.Tile;
using Core.Tile.Editor.Vulcanus;
using Core.Tile.Vulcanus;
using Core.TimeAndWeather;
using Interaction;
using Interaction.Dialogue;
using NUnit.Framework;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;
using VContainer;
using VContainer.Unity;
using static Core.Common.Editor.Reflect;
using Object = UnityEngine.Object;

namespace Core.Routines.Editor
{
    /// <summary>
    /// Fabia's routine in the Vulcanus test project: from home in the house, Fabia walks to a spot on map-1 with an
    /// activity, then back home. These tests watch the test project's map-1, whose scene plays with test content only,
    /// so editing the game's own Fabia never breaks them. Times and places are read from the test timetable.
    /// </summary>
    public sealed class RoutinePresencePlayTests
    {
        private const string MapScene = "Assets/Tests/Scenes/map-1.unity";
        private const string Map = "test:map-1";
        private const string Fabia = "test:fabia";

        [UnityTest]
        public IEnumerator EnteringTheMapPlacesFabiaWhereTheTimetableSays()
        {
            // The test runner only enters Play mode when the test itself yields this instruction.
            EditorSceneManager.OpenScene(MapScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return WaitForGame();
            var service = LiveGame.Get<RoutineNpcService>();
            var level = LiveGame.Get<LevelManager>();
            var day = FabiasDay(service);
            Assert.That(None(service), Is.True, "Before setting off, Fabia is at home in the house.");

            // Partway along the walk on this map, Fabia is placed on the route, walking on.
            var walkIn = day.Segments.First(s => s.IsWalk && s.MapId == Map && s.Enters != null);
            SetTime(Mid(walkIn));
            var fabia = ReEnter(service, level);
            yield return null;
            yield return null;
            Assert.That(fabia.Controller.IsMovementOwned, Is.True, "Fabia walks on.");
            Assert.That(Vector2.Distance(fabia.Graphics.position, Start(walkIn)), Is.GreaterThan(0.5f), "Fabia is past the door they came in by.");
            Assert.That(fabia.GetComponentInChildren<ShowVulcanusDialogueInteractable>(true).DialogueId,
                Is.EqualTo(day.Plan.DialogueAt(walkIn.GoalIndex, arrived: false).Id ?? ""), "Fabia says what the routine sets for the walk.");

            // During the stay, Fabia is at the spot with the activity.
            var stay = day.Segments.First(s => !s.IsWalk && s.MapId == Map);
            SetTime(Mid(stay));
            fabia = ReEnter(service, level);
            yield return null;
            yield return null; // The activity starts once Fabia has entered the location.
            Assert.That(FeetDistance(fabia, stay.Place.Anchor), Is.LessThan(0.05f));
            Assert.That(PoseActive(fabia), Is.True, "The activity plays at the destination.");

            // Leaving the map removes Fabia; nothing about them is saved.
            service.OnLocationLeave(level.CurrentLocationData);
            Assert.That(service.Characters, Is.Empty);
            yield return null;
            Assert.That(Object.FindObjectsByType<GameCharacter>(FindObjectsInactive.Include).Where(c => c.CharacterId == Fabia), Is.Empty);
        }

        [UnityTest]
        public IEnumerator TalkingHoldsFabiaUpUntilTooLateToTalk()
        {
            EditorSceneManager.OpenScene(MapScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return WaitForGame();
            var service = LiveGame.Get<RoutineNpcService>();
            var level = LiveGame.Get<LevelManager>();
            var settings = LiveGame.Get<RoutineSettings>();
            var runner = LiveGame.Get<Core.Dialogue.Vulcanus.VulcanusDialogueRunner>();
            var day = FabiasDay(service);
            var walkIn = day.Segments.First(s => s.IsWalk && s.MapId == Map && s.Enters != null);
            SetTime(Mid(walkIn));
            var fabia = ReEnter(service, level);
            yield return WaitUntil(() => fabia.Controller.IsMovementOwned, "Fabia walks on.");
            settings.pauseAfterTalkingSeconds = 0.5f;
            var talk = fabia.GetComponentInChildren<ShowVulcanusDialogueInteractable>(true);

            // Fabia stops for the conversation, and stays put a moment after it.
            talk.TriggerInteraction(LiveGame.Player);
            Assert.That(talk.IsTalking, Is.True);
            yield return null;
            Assert.That(fabia.Controller.IsMovementOwned, Is.False, "Fabia stops to talk.");
            runner.StopDialogue();
            var ended = Time.realtimeSinceStartup;
            yield return WaitUntil(() => fabia.Controller.IsMovementOwned, "Fabia goes on after a moment.");
            Assert.That(Time.realtimeSinceStartup - ended, Is.GreaterThanOrEqualTo(0.4f), "Fabia stayed put after the conversation.");

            // Once conversations have held Fabia up too long, they move on and can't be talked to.
            settings.maxDelayMinutes = 0.1f;
            yield return null;
            Assert.That(talk.CanInteract, Is.False, "Running too late to talk.");
            talk.TriggerInteraction(LiveGame.Player);
            Assert.That(talk.IsTalking, Is.False);
            yield return null;
            Assert.That(fabia.Controller.IsMovementOwned, Is.True, "Fabia keeps walking.");

            // Reaching the place in time for the stay catches Fabia up: they can be talked to again.
            yield return WaitUntil(() => PoseActive(fabia), "Fabia arrives at the place.");
            yield return null;
            Assert.That(talk.CanInteract, Is.True, "The stay absorbed the delay.");
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

            // When the timetable brings Fabia through the door, they fade in at its arrival anchor and walk to the spot.
            SetTime(Mathf.FloorToInt(walkIn.StartMinute));
            yield return WaitUntil(() => service.Characters.Any(), "Fabia comes in while the player watches.");
            var fabia = Single(service);
            Assert.That(Vector2.Distance(fabia.Graphics.position, Start(walkIn)), Is.LessThan(0.5f), "Fabia comes in at the door.");
            yield return WaitUntil(() => fabia.Controller.IsMovementOwned, "Fabia walks on.");

            // While game time stands still, such as during a dialogue, Fabia stands still too.
            var clock = LiveGame.Get<GameClock>();
            clock.Pause(this);
            yield return null;
            Assert.That(fabia.Controller.IsMovementOwned, Is.False, "Fabia stops walking.");
            for (var i = 0; i < 5; i++) yield return null; // The body settles after letting go.
            var halted = (Vector2)fabia.Graphics.position;
            for (var i = 0; i < 10; i++) yield return null;
            Assert.That(Vector2.Distance(fabia.Graphics.position, halted), Is.LessThan(0.01f), "Fabia stays where they stopped.");
            clock.Resume(this);

            yield return WaitUntil(() => !fabia.Controller.IsMovementOwned && PoseActive(fabia), "Fabia walks on, arrives and starts the activity.");
            Assert.That(FeetDistance(fabia, stay.Place.Anchor), Is.LessThan(0.05f));
            Assert.That(Single(service), Is.SameAs(fabia), "Fabia is the same character all along.");

            // When the stay ends, Fabia walks to the door they leave by and fades out.
            SetTime((int)stay.EndMinute);
            yield return WaitUntil(() => fabia.Controller.IsMovementOwned, "Fabia sets off home.");
            var last = Vector2.zero;
            yield return WaitUntil(() =>
            {
                if (fabia) last = fabia.Graphics.position;
                return None(service);
            }, "Fabia leaves through the door.");
            Assert.That(Vector2.Distance(last, End(walkOut)), Is.LessThan(0.1f), "Fabia fades out at the door.");
            Assert.That(LiveGame.Get<MapManager>().CurrentMap.MapId, Is.EqualTo(Map),
                "Standing in the door's trigger doesn't take anyone but the player through it.");
            yield return null;
            Assert.That(None(service), Is.True, "Fabia isn't brought back while the timetable has them walking home.");
        }

        [UnityTest]
        public IEnumerator AtABenchFabiaSitsWaitsAngrilyWhileItIsTakenAndGetsUpWhenTheGoalEnds()
        {
            EditorSceneManager.OpenScene(MapScene, OpenSceneMode.Single);
            yield return new EnterPlayMode();
            yield return WaitForGame();
            var service = LiveGame.Get<RoutineNpcService>();
            var level = LiveGame.Get<LevelManager>();
            LiveGame.Get<RoutineSettings>().slotRetrySeconds = 0.2f;
            var map = LiveGame.Get<MapManager>().CurrentMap;
            var anchors = map.GetComponentsInChildren<VulcanusMapAnchor>(true);
            var bench = LiveGame.Get<IObjectResolver>().Instantiate(
                UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Interaction/BenchPrototype.prefab"),
                anchors[0].transform.position + Vector3.up * 0.9f, Quaternion.identity, map.transform);
            bench.AddComponent<VulcanusMapEntity>().Configure("test-bench");
            var seat = bench.GetComponent<SeatInteractable>();
            var slot = bench.GetComponentInChildren<InteractionSlot>();

            // Fabia's day is replaced by one goal: the bench, and then back to an anchor an hour later.
            var exit = (Vector2)map.transform.InverseTransformPoint(slot.ExitPoint.position);
            var anchorPositions = anchors.ToDictionary(anchor => anchor.AnchorId, anchor => (Vector2)map.transform.InverseTransformPoint(anchor.transform.position));
            var world = new WorldNavigation(new[]
            {
                new NavigationMap(map.MapId, map.GetComponentInChildren<VulcanusImportedMap>(true).NavigationCosts, anchorPositions,
                    new Dictionary<string, Vector2> { ["test-bench"] = exit })
            }, new MapLinkGraph(System.Array.Empty<MapLink>()));
            var place = $"{{ map: '{map.MapId}', anchor: '{anchors[0].AnchorId}' }}";
            var routine = VulcanusJson.Populate(ScriptableObject.CreateInstance<RoutineDefinition>(),
                $"{{ id: 'test:bench_routine', character: '{Fabia}', home: {place}, variants: [{{ id: 'default', goals: [" +
                $"{{ id: 'sit', departAt: '08:00', destination: {{ map: '{map.MapId}', entity: 'test-bench' }} }}," +
                $"{{ id: 'leave', departAt: '12:00', destination: {place} }}] }}] }}");
            var plan = new DayPlan(routine, "default", routine.Variants[0].Goals.Select(goal => new PlannedGoal(goal, routine.Home)).ToArray());
            var dayType = typeof(RoutineNpcService).GetNestedType("Day", System.Reflection.BindingFlags.NonPublic);
            var day = System.Activator.CreateInstance(dayType);
            Set(day, "Timetable", RoutineTimetablePlanner.Plan(plan, world, 2f, 0.5f));
            var days = Get<System.Collections.IList>(service, "_days");
            days.Clear();
            days.Add(day);

            // The bench is taken: Fabia faces the camera and shows the emote while they wait.
            LiveGame.Player.Occupation.TryEnter(slot);
            SetTime(10 * 60);
            var fabia = ReEnter(service, level);
            yield return WaitUntil(() => fabia.Graphics.Find("Emote callout") != null, "Fabia is annoyed that the bench is taken.");
            Assert.That(slot.Occupant, Is.SameAs(LiveGame.Player.Occupation));
            Assert.That(fabia.Orientation.FacingDirection, Is.EqualTo(Vector2.down), "Fabia looks at the camera.");

            // Once it is free, Fabia sits, and the emote goes.
            LiveGame.Player.Occupation.ReleaseImmediately();
            yield return WaitUntil(() => slot.Occupant == fabia.Occupation, "Fabia takes the free bench.");
            yield return WaitUntil(() => fabia.Occupation.Phase == CharacterOccupation.OccupationPhase.Occupied, "Fabia is seated.");
            Assert.That(fabia.Graphics.Find("Emote callout"), Is.Null);
            Assert.That(seat.CanInteract, Is.False);

            // When the goal ends, Fabia gets up and sets off.
            SetTime(12 * 60);
            yield return WaitUntil(() => slot.Occupant == null && fabia.Controller.IsMovementOwned, "Fabia gets up and walks on.");
        }

        private static RoutineTimetable FabiasDay(RoutineNpcService service)
        {
            var day = service.Timetables.Single(each => each.Plan.Routine.Character == Fabia);
            Assert.That(day.Plan.Routine.Home.Map, Is.Not.EqualTo(Map), "These tests expect Fabia to live on another map.");
            Assert.That(day.Segments.Count(s => !s.IsWalk && s.MapId == Map), Is.EqualTo(1), "Fabia stays once on this map.");
            Assert.That(MinuteOfDay(), Is.LessThan(day.Plan.Goals[0].DepartMinute), "The game starts before Fabia's first departure.");
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
