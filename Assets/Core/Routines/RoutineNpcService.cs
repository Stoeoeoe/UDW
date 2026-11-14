using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Character.Animations;
using Core.Events;
using Core.Game;
using Core.Location;
using Core.Scripting;
using Core.Spawning;
using Core.Tile;
using Core.Tile.Vulcanus;
using Core.TimeAndWeather;
using Interaction.Dialogue;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using Object = UnityEngine.Object;

namespace Core.Routines
{
    /// <summary>
    /// Brings routine characters into the entered location where their timetable puts them at the current time, moves
    /// them through their day while the location stays loaded, and lets them leave and arrive through its doors.
    /// Nothing is saved: the timetable and the clock decide where everyone is, so loading mid-day places them again.
    /// </summary>
    /// <remarks>
    /// Days are planned when the service starts, when a game is started or loaded, and at each new day. Overnight the
    /// player returns home before the new day begins, so the new day re-places the characters in the current location.
    /// </remarks>
    public sealed class RoutineNpcService : ILocationLifecycle, ITickable, IDisposable, IEventListener<NewDayEvent>
    {
        private const float FadeSeconds = 0.3f;
        // How close counts as already being at a place, so she doesn't walk a few pixels there.
        private const float AtPlaceDistance = 0.1f;

        private sealed class Day
        {
            public RoutineTimetable Timetable;
            /// <summary>
            /// The segment in which she last left the current map through a door. She isn't brought back before her
            /// timetable moves past it, even when she reached the door earlier than planned.
            /// </summary>
            public int LeftAt = -1;
        }

        private sealed class Npc
        {
            public Day Day;
            public GameObject Instance;
            public GameCharacter Character;
            public SpriteRenderer[] Sprites;
            /// <summary>What talking to the character starts; the routine changes its dialogue through the day.</summary>
            public ShowVulcanusDialogueInteractable Talk;
            /// <summary>Index of the timetable segment she is living through.</summary>
            public int Index;
            /// <summary>Set once the character has entered the location; until then its entry idle would replace any pose.</summary>
            public bool Settled;
            public Vector2 Facing;
            public CharacterAnimationDefinition PendingActivity;
            public UrCharacterAnimator.ActivityPlayback Activity;
            /// <summary>A plain looping animation or set is playing, which has no end to wait for.</summary>
            public bool PlainActivity;
            public NavigationRoute Route;
            /// <summary>Seconds into a fade; negative when not fading.</summary>
            public float FadeTime = -1;
            public bool FadingOut;

            public TimetableSegment Segment => Day.Timetable.Segments[Index];
        }

        private readonly IObjectResolver _resolver;
        private readonly GameState _state;
        private readonly ClockSettings _clockSettings;
        private readonly MapManager _maps;
        private readonly RoutineCatalog _routines;
        private readonly CharacterCatalog _characters;
        private readonly CharacterAnimationCatalog _animations;
        private readonly WorldObjectSpawner _spawner;
        private readonly LuaRuntime _lua;
        private readonly WorldCatalog _worlds;

        private readonly List<Day> _days = new();
        private WorldNavigation _world;
        private IReadOnlyDictionary<string, SpawnedObject> _prefabs;
        private readonly List<Npc> _npcs = new();
        private Transform _root;
        private string _mapId;

        public RoutineNpcService(IObjectResolver resolver, GameState state, ClockSettings clockSettings,
            MapManager maps, RoutineCatalog routines, CharacterCatalog characters, CharacterAnimationCatalog animations,
            WorldObjectSpawner spawner, LuaRuntime lua, WorldCatalog worlds)
        {
            _resolver = resolver;
            _state = state;
            _clockSettings = clockSettings;
            _maps = maps;
            _routines = routines;
            _characters = characters;
            _animations = animations;
            _spawner = spawner;
            _lua = lua;
            _worlds = worlds;
            _state.Restored += PlanDay;
            EventBus<NewDayEvent>.Subscribe(this);
            // The first game is started before this service exists, so plan its current day now.
            PlanDay();
        }

        /// <summary>Routine characters currently in the location.</summary>
        public IEnumerable<GameCharacter> Characters
        {
            get { foreach (var npc in _npcs) yield return npc.Character; }
        }

        /// <summary>Today's timetables, one per enabled routine.</summary>
        public IEnumerable<RoutineTimetable> Timetables => _days.Select(day => day.Timetable);

        public void OnLocationEnter(LocationData location)
        {
            if (_npcs.Count > 0) throw new InvalidOperationException("Routine characters must be removed when a location is left.");
            // Routines name Vulcanus maps; a location's own ID can be a hand-authored scene name.
            _mapId = _maps.CurrentMap.MapId;
            PlaceAll();
        }

        public void OnLocationLeave(LocationData location)
        {
            Clear();
            _mapId = null;
        }

        public void OnEvent(NewDayEvent e)
        {
            PlanDay();
            if (_mapId == null) return;
            // The overnight blackout hides the change: everyone starts the new day where its timetable puts them.
            Clear();
            PlaceAll();
        }

        public void Tick()
        {
            if (_mapId == null) return;
            var minute = Minute();
            // Iterate a copy: a character who leaves through a door is removed.
            foreach (var npc in _npcs.ToArray())
            {
                if (!npc.Character || !npc.Character.IsInLocation) continue;
                if (!npc.Settled) Settle(npc);
                Fade(npc, Time.deltaTime);
                if (npc.FadingOut) continue;
                Advance(npc, minute, Time.deltaTime);
            }
            // Characters whose timetable now brings them onto this map, usually through one of its doors.
            foreach (var day in _days)
            {
                if (_npcs.Any(npc => npc.Day == day)) continue;
                var index = day.Timetable.IndexAt(minute);
                if (index > day.LeftAt && day.Timetable.Segments[index].MapId == _mapId) Spawn(day, index, minute, fadeIn: true);
            }
        }

        public void Dispose()
        {
            _state.Restored -= PlanDay;
            EventBus<NewDayEvent>.Unsubscribe(this);
            Clear();
        }

        /// <summary>Minutes after midnight, including the way through the clock's current step.</summary>
        private float Minute()
        {
            var time = _state.Time;
            return time.hour * 60 + time.minute + time.secondsTowardNextMinute / _clockSettings.SecondsPerMinute;
        }

        private void PlanDay()
        {
            var day = _state.Time.daysSinceStart;
            _days.Clear();
            _world ??= WorldNavigation.Build(_worlds.EnabledDefinitions.ToArray());
            var planner = new RoutinePlanner(_lua.CreateEngine());
            var dayStart = _clockSettings.startOfDay * 60;
            var dayEnd = _clockSettings.endOfDay * 60;
            foreach (var routine in _routines.EnabledDefinitions)
            {
                var plan = planner.PlanDay(routine, day);
                foreach (var goal in plan.Goals)
                    if (goal.DepartMinute < dayStart || goal.DepartMinute >= dayEnd)
                        throw new InvalidOperationException($"Routine '{routine.RoutineId}': goal '{goal.Id}' departs at " +
                            $"{goal.DepartMinute / 60:00}:{goal.DepartMinute % 60:00}, outside the day ({_clockSettings.startOfDay:00}:00-{_clockSettings.endOfDay:00}:00).");
                // The timetable uses the authored walk speed; boons change only how fast she walks in sight.
                var timetable = RoutineTimetablePlanner.Plan(plan, _world, _characters.Require(routine.CharacterId).WalkSpeed,
                    _clockSettings.SecondsPerMinute);
                foreach (var warning in timetable.Warnings) Debug.LogWarning(warning);
                _days.Add(new Day { Timetable = timetable });
            }
        }

        private void PlaceAll()
        {
            // The new root goes into the active scene, which LevelManager sets to the entered location.
            _root = new GameObject("Routine characters").transform;
            var minute = Minute();
            foreach (var day in _days)
            {
                day.LeftAt = -1;
                var index = day.Timetable.IndexAt(minute);
                if (day.Timetable.Segments[index].MapId == _mapId) Spawn(day, index, minute, fadeIn: false);
            }
        }

        // ── Placing ─────────────────────────────────────────────────────────────────

        /// <summary>Puts the character where the segment has her at this minute: at its place, or along its walk.</summary>
        private void Spawn(Day day, int index, float minute, bool fadeIn)
        {
            var routine = day.Timetable.Plan.Routine;
            _prefabs ??= ActorSpawnDefinitions.Find(_spawner.RegisteredPrefabs, _characters);
            if (!_prefabs.TryGetValue(routine.CharacterId, out var prefab))
                throw new InvalidOperationException($"Routine '{routine.RoutineId}' needs a spawnable prefab for character '{routine.CharacterId}'.");
            var instance = _resolver.Instantiate(prefab.gameObject, prefab.transform.position, prefab.transform.rotation, _root);
            instance.name = $"{prefab.name} (routine)";
            var npc = new Npc
            {
                Day = day,
                Index = index,
                Instance = instance,
                Character = instance.GetComponentInChildren<GameCharacter>(true),
                Sprites = instance.GetComponentsInChildren<SpriteRenderer>(true),
                Talk = instance.GetComponentInChildren<ShowVulcanusDialogueInteractable>(true)
            };
            _npcs.Add(npc);
            var segment = npc.Segment;
            if (segment.IsWalk)
            {
                var feet = segment.PositionAt(minute);
                var ahead = segment.PositionAt(Mathf.Min(minute + 0.1f, segment.EndMinute));
                PlaceFeet(npc.Character, ToWorld(feet));
                npc.Facing = Cardinal(ahead - feet);
                UpdateDialogue(npc);
            }
            else StandAt(npc);
            if (fadeIn)
            {
                npc.FadeTime = 0;
                SetAlpha(npc, 0);
            }
        }

        /// <summary>Puts the character at her segment's place, facing its anchor's direction, with its activity to start.</summary>
        private void StandAt(Npc npc)
        {
            var anchor = Anchor(npc.Segment.Place);
            PlaceFeet(npc.Character, anchor.transform.position);
            npc.Facing = anchor.FacingDirection;
            npc.PendingActivity = Activity(npc);
            UpdateDialogue(npc);
        }

        // ── Living through the day ─────────────────────────────────────────────────

        private void Settle(Npc npc)
        {
            npc.Settled = true;
            npc.Character.Orientation.ForceDirection(npc.Facing);
            if (npc.Segment.IsWalk) Walk(npc, ToWorld(npc.Segment.Route[^1]));
            else StartActivity(npc, npc.PendingActivity);
        }

        private void Advance(Npc npc, float minute, float deltaTime)
        {
            var segment = npc.Segment;
            if (npc.Route != null)
            {
                npc.Route.Tick(deltaTime);
                if (npc.Route.Status == NavigationMoveStatus.Moving) return;
                // Something stopped her on the way; carry on as if she had arrived, like an NPC catching up off-screen.
                if (npc.Route.Status != NavigationMoveStatus.Arrived)
                    Debug.LogWarning($"Routine '{npc.Day.Timetable.Plan.Routine.RoutineId}': walking on '{_mapId}' stopped " +
                        $"({npc.Route.Error}). Placing the character at the end of the walk.", npc.Character);
                npc.Route.Dispose();
                npc.Route = null;
                if (segment.IsWalk && segment.Leaves != null)
                {
                    // Through the door: she fades out here and goes on in her timetable.
                    PlaceFeet(npc.Character, ToWorld(segment.Route[^1]));
                    npc.Day.LeftAt = npc.Index;
                    npc.FadingOut = true;
                    npc.FadeTime = 0;
                    return;
                }
                if (segment.IsWalk) Begin(npc, Next(npc, minute));
                else Arrive(npc);
                return;
            }

            if (segment.IsWalk || minute < segment.EndMinute) return;
            // Finish the current activity before setting off; its end animation may take a moment.
            if (npc.Activity != null && !npc.Activity.IsCompleted && !npc.Activity.IsInterrupted)
            {
                npc.Activity.RequestEnd();
                if (!npc.Activity.IsCompleted) return;
            }
            if (npc.PlainActivity) npc.Character.Animator.EndInteractionAnimation();
            npc.Activity = null;
            npc.PlainActivity = false;
            Begin(npc, Next(npc, minute));
        }

        /// <summary>
        /// The segment after the current one, or the one the timetable has reached if she is behind it: a late arrival
        /// sets off again at once, and after the clock jumps she heads straight for where she should be.
        /// </summary>
        private static int Next(Npc npc, float minute) => Mathf.Max(npc.Index + 1, npc.Day.Timetable.IndexAt(minute));

        private void Begin(Npc npc, int index)
        {
            npc.Index = index;
            var segment = npc.Segment;
            if (segment.MapId != _mapId)
            {
                // Only after the clock jumped past her walk to a door: she leaves without walking there.
                npc.Day.LeftAt = index - 1;
                npc.FadingOut = true;
                npc.FadeTime = 0;
                return;
            }
            if (segment.IsWalk)
            {
                Walk(npc, ToWorld(segment.Route[^1]));
                return;
            }
            var place = (Vector2)Anchor(segment.Place).transform.position;
            if (Vector2.Distance(Feet(npc.Character), place) > AtPlaceDistance) Walk(npc, place);
            else Arrive(npc);
        }

        private void Walk(Npc npc, Vector2 feet)
        {
            npc.Route = CharacterNavigation.NavigateTo(npc.Character, feet, _maps);
            UpdateDialogue(npc, walking: true);
        }

        /// <summary>At her segment's place: on the exact spot, which activities such as sitting need, playing its activity.</summary>
        private void Arrive(Npc npc)
        {
            var anchor = Anchor(npc.Segment.Place);
            PlaceFeet(npc.Character, anchor.transform.position);
            npc.Character.Orientation.ForceDirection(anchor.FacingDirection);
            StartActivity(npc, Activity(npc));
            UpdateDialogue(npc);
        }

        /// <summary>Lets the character say what the routine has set for this point of the day.</summary>
        private static void UpdateDialogue(Npc npc, bool walking = false)
        {
            var segment = npc.Segment;
            var plan = npc.Day.Timetable.Plan;
            var dialogue = plan.DialogueAt(segment.GoalIndex, arrived: !segment.IsWalk && !walking);
            if (npc.Talk) npc.Talk.UseDialogue(dialogue);
            else if (dialogue != null)
                throw new InvalidOperationException($"Routine '{plan.Routine.RoutineId}' sets the dialogue '{dialogue}', but " +
                    $"character '{npc.Character.CharacterId}' has no {nameof(ShowVulcanusDialogueInteractable)} to say it.");
        }

        private void StartActivity(Npc npc, CharacterAnimationDefinition animation)
        {
            npc.PendingActivity = null;
            if (!animation) return;
            if (animation is CharacterActivityAnimation activity) npc.Activity = npc.Character.Animator.PlayActivity(activity);
            else
            {
                npc.Character.Animator.PlayInteractionAnimation(animation);
                npc.PlainActivity = true;
            }
        }

        /// <summary>Fades her in after arriving through a door, or out after leaving through one; then she is removed.</summary>
        private void Fade(Npc npc, float deltaTime)
        {
            if (npc.FadeTime < 0) return;
            npc.FadeTime += deltaTime;
            var progress = Mathf.Clamp01(npc.FadeTime / FadeSeconds);
            SetAlpha(npc, npc.FadingOut ? 1 - progress : progress);
            if (progress < 1) return;
            npc.FadeTime = -1;
            if (npc.FadingOut) Remove(npc);
        }

        // ── Helpers ────────────────────────────────────────────────────────────────

        private CharacterAnimationDefinition Activity(Npc npc)
        {
            var goalIndex = npc.Segment.GoalIndex;
            var id = goalIndex < 0 ? null : npc.Day.Timetable.Plan.Goals[goalIndex].ActivityAnimationId;
            return string.IsNullOrEmpty(id) ? null
                : _animations.Get(id) ?? throw new InvalidOperationException($"Animation '{id}' is not registered and enabled.");
        }

        private VulcanusMapAnchor Anchor(RoutinePlace place) =>
            _maps.TryGetAnchor(place.AnchorId, out var anchor)
                ? anchor
                : throw new InvalidOperationException($"Map '{place.MapId}' has no anchor '{place.AnchorId}'.");

        /// <summary>A timetable position, in the current map's local space, in the world.</summary>
        private Vector2 ToWorld(Vector2 local) => _maps.CurrentMap.transform.TransformPoint(local);

        private static Vector2 Cardinal(Vector2 direction) =>
            Mathf.Abs(direction.x) >= Mathf.Abs(direction.y)
                ? (direction.x >= 0 ? Vector2.right : Vector2.left)
                : (direction.y >= 0 ? Vector2.up : Vector2.down);

        private static Vector2 Feet(GameCharacter character) => (Vector2)character.transform.position + NavigationPlan.FeetOffset(character);

        private static void PlaceFeet(GameCharacter character, Vector2 feet)
        {
            character.transform.position = feet - NavigationPlan.FeetOffset(character);
            Physics2D.SyncTransforms();
        }

        private static void SetAlpha(Npc npc, float alpha)
        {
            foreach (var sprite in npc.Sprites)
            {
                var color = sprite.color;
                color.a = alpha;
                sprite.color = color;
            }
        }

        private static void Release(Npc npc)
        {
            npc.Route?.Dispose();
            npc.Activity?.Dispose();
        }

        private void Remove(Npc npc)
        {
            Release(npc);
            _npcs.Remove(npc);
            Destroy(npc.Instance);
        }

        private void Clear()
        {
            foreach (var npc in _npcs) Release(npc);
            _npcs.Clear();
            if (_root) Destroy(_root.gameObject);
            _root = null;
        }

        private static void Destroy(GameObject target)
        {
            if (Application.isPlaying) Object.Destroy(target);
            else Object.DestroyImmediate(target);
        }
    }
}
