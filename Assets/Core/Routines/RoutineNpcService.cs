using System;
using System.Collections.Generic;
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
using UnityEngine;
using VContainer;
using VContainer.Unity;
using Object = UnityEngine.Object;

namespace Core.Routines
{
    /// <summary>
    /// Brings routine characters into the entered location where their day plan puts them at the current time, moves
    /// them through the rest of their day while the location stays loaded, and removes them when it is left. Nothing is
    /// saved: the plan and the clock decide where everyone is, so loading mid-day places them again.
    /// </summary>
    /// <remarks>
    /// Days are planned when the service starts, when a game is started or loaded, and at each new day. Overnight the
    /// player returns home before the new day begins, so the new day re-places the characters in the current location.
    /// </remarks>
    public sealed class RoutineNpcService : ILocationLifecycle, ITickable, IDisposable, IEventListener<NewDayEvent>
    {
        private sealed class Npc
        {
            public GameObject Instance;
            public GameCharacter Character;
            public DayPlan Plan;
            /// <summary>The goal most recently set off for; -1 while still at home.</summary>
            public int GoalIndex;
            /// <summary>Set once the character has entered the location; until then its entry idle would replace any pose.</summary>
            public bool Settled;
            public Vector2 Facing;
            /// <summary>Goal still being walked to when the character was placed partway along its route.</summary>
            public PlannedGoal WalkOnTo;
            public CharacterAnimationDefinition PendingActivity;
            public UrCharacterAnimator.ActivityPlayback Activity;
            /// <summary>A plain looping animation or set is playing, which has no end to wait for.</summary>
            public bool PlainActivity;
            public NavigationRoute Route;
            public PlannedGoal Heading;
        }

        private readonly IObjectResolver _resolver;
        private readonly GameState _state;
        private readonly GameClock _clock;
        private readonly ClockSettings _clockSettings;
        private readonly MapManager _maps;
        private readonly RoutineCatalog _routines;
        private readonly CharacterCatalog _characters;
        private readonly CharacterAnimationCatalog _animations;
        private readonly WorldObjectSpawner _spawner;
        private readonly LuaRuntime _lua;

        private readonly List<DayPlan> _plans = new();
        private IReadOnlyDictionary<string, SpawnedObject> _prefabs;
        private readonly List<Npc> _npcs = new();
        private Transform _root;
        private string _mapId;

        public RoutineNpcService(IObjectResolver resolver, GameState state, GameClock clock, ClockSettings clockSettings,
            MapManager maps, RoutineCatalog routines, CharacterCatalog characters, CharacterAnimationCatalog animations,
            WorldObjectSpawner spawner, LuaRuntime lua)
        {
            _resolver = resolver;
            _state = state;
            _clock = clock;
            _clockSettings = clockSettings;
            _maps = maps;
            _routines = routines;
            _characters = characters;
            _animations = animations;
            _spawner = spawner;
            _lua = lua;
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

        /// <summary>Today's plans, one per enabled routine.</summary>
        public IReadOnlyList<DayPlan> Plans => _plans;

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
            // The overnight blackout hides the change: everyone starts the new day where its plan puts them.
            Clear();
            PlaceAll();
        }

        public void Tick()
        {
            if (_npcs.Count == 0) return;
            var minute = MinuteOfDay();
            // Iterate a copy: a character who leaves for another map is removed.
            foreach (var npc in _npcs.ToArray())
            {
                if (!npc.Character || !npc.Character.IsInLocation) continue;
                if (!npc.Settled) Settle(npc);
                Advance(npc, minute, Time.deltaTime);
            }
        }

        public void Dispose()
        {
            _state.Restored -= PlanDay;
            EventBus<NewDayEvent>.Unsubscribe(this);
            Clear();
        }

        private int MinuteOfDay()
        {
            var time = _clock.CurrentTime;
            return time.Hour * 60 + time.Minute;
        }

        private void PlanDay()
        {
            var day = _state.Time.daysSinceStart;
            _plans.Clear();
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
                _plans.Add(plan);
            }
        }

        private void PlaceAll()
        {
            // The new root goes into the active scene, which LevelManager sets to the entered location.
            _root = new GameObject("Routine characters").transform;
            var minute = MinuteOfDay();
            foreach (var plan in _plans) Place(plan, plan.At(minute));
        }

        // ── Placing on location entry ───────────────────────────────────────────────

        private void Place(DayPlan plan, RoutineMoment moment)
        {
            var routine = plan.Routine;
            if (moment.IsHome)
            {
                if (routine.Home.MapId == _mapId) Spawn(plan, moment, routine.Home, null);
                return;
            }
            var goal = moment.Goal;
            var to = goal.Destination;
            // Travel between maps isn't built yet: until it is, a character is at another map's destination once she sets off.
            if (moment.From.MapId != to.MapId)
            {
                if (to.MapId == _mapId) Spawn(plan, moment, to, goal);
                return;
            }
            if (to.MapId != _mapId) return;

            // Start at the departure point, then measure the route to find how far she has come.
            var npc = Spawn(plan, moment, moment.From, null);
            var route = CharacterNavigation.PlanRoute(npc.Character, AnchorFeet(to), _maps);
            if (!route.Found)
            {
                Debug.LogWarning($"Routine '{routine.RoutineId}': {route.Error} Placing the character at '{to}' instead.", npc.Character);
                StandAt(npc, to, goal);
                return;
            }
            var walked = moment.MinutesSinceDeparture * _clockSettings.secondsPerInGameMinute * npc.Character.Attributes.WalkSpeed;
            if (walked >= route.Length)
            {
                StandAt(npc, to, goal);
                return;
            }
            var feet = route.PointAt(walked);
            PlaceFeet(npc.Character, feet);
            npc.Facing = Cardinal(route.PointAt(Mathf.Min(walked + 0.5f, route.Length)) - feet);
            npc.WalkOnTo = goal;
        }

        private Npc Spawn(DayPlan plan, RoutineMoment moment, RoutinePlace place, PlannedGoal goal)
        {
            var routine = plan.Routine;
            _prefabs ??= ActorSpawnDefinitions.Find(_spawner.RegisteredPrefabs, _characters);
            if (!_prefabs.TryGetValue(routine.CharacterId, out var prefab))
                throw new InvalidOperationException($"Routine '{routine.RoutineId}' needs a spawnable prefab for character '{routine.CharacterId}'.");
            var instance = _resolver.Instantiate(prefab.gameObject, prefab.transform.position, prefab.transform.rotation, _root);
            instance.name = $"{prefab.name} (routine)";
            var npc = new Npc
            {
                Instance = instance,
                Character = instance.GetComponentInChildren<GameCharacter>(true),
                Plan = plan,
                GoalIndex = moment.GoalIndex
            };
            _npcs.Add(npc);
            StandAt(npc, place, goal);
            return npc;
        }

        /// <summary>Puts the character at a place, facing its anchor's direction, with the goal's activity to start.</summary>
        private void StandAt(Npc npc, RoutinePlace place, PlannedGoal goal)
        {
            var anchor = Anchor(place);
            PlaceFeet(npc.Character, anchor.transform.position);
            npc.Facing = anchor.FacingDirection;
            npc.PendingActivity = Activity(goal);
        }

        // ── Living through the day ─────────────────────────────────────────────────

        private void Settle(Npc npc)
        {
            npc.Settled = true;
            npc.Character.Orientation.ForceDirection(npc.Facing);
            if (npc.WalkOnTo != null) Walk(npc, npc.WalkOnTo);
            else StartActivity(npc, npc.PendingActivity);
        }

        private void Advance(Npc npc, int minute, float deltaTime)
        {
            if (npc.Route != null)
            {
                npc.Route.Tick(deltaTime);
                if (npc.Route.Status == NavigationMoveStatus.Moving) return;
                var goal = npc.Heading;
                // Something stopped her on the way; carry on as if she had arrived, like an NPC catching up off-screen.
                if (npc.Route.Status != NavigationMoveStatus.Arrived)
                    Debug.LogWarning($"Routine '{npc.Plan.Routine.RoutineId}': walking to '{goal.Destination}' stopped " +
                        $"({npc.Route.Error}). Placing the character there.", npc.Character);
                npc.Route.Dispose();
                npc.Route = null;
                npc.Heading = null;
                // Walking stops within a few pixels and coasts; activities such as sitting need the exact spot.
                var anchor = Anchor(goal.Destination);
                PlaceFeet(npc.Character, anchor.transform.position);
                npc.Character.Orientation.ForceDirection(anchor.FacingDirection);
                StartActivity(npc, Activity(goal));
                return;
            }

            var due = npc.GoalIndex;
            var goals = npc.Plan.Goals;
            while (due + 1 < goals.Count && goals[due + 1].DepartMinute <= minute) due++;
            if (due == npc.GoalIndex) return;

            // Finish the current activity before setting off; its end animation may take a moment.
            if (npc.Activity != null && !npc.Activity.IsCompleted && !npc.Activity.IsInterrupted)
            {
                npc.Activity.RequestEnd();
                if (!npc.Activity.IsCompleted) return;
            }
            if (npc.PlainActivity) npc.Character.Animator.EndInteractionAnimation();
            npc.Activity = null;
            npc.PlainActivity = false;

            // When the clock jumped past several departures, she heads straight for the latest.
            npc.GoalIndex = due;
            var next = goals[due];
            if (next.Destination.MapId != _mapId)
            {
                // Travel between maps isn't built yet: she leaves this map at once.
                Remove(npc);
                return;
            }
            Walk(npc, next);
        }

        private void Walk(Npc npc, PlannedGoal goal)
        {
            npc.WalkOnTo = null;
            npc.Heading = goal;
            npc.Route = CharacterNavigation.NavigateTo(npc.Character, AnchorFeet(goal.Destination), _maps);
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

        // ── Helpers ────────────────────────────────────────────────────────────────

        private CharacterAnimationDefinition Activity(PlannedGoal goal) =>
            string.IsNullOrEmpty(goal?.ActivityAnimationId) ? null
                : _animations.Get(goal.ActivityAnimationId)
                  ?? throw new InvalidOperationException($"Animation '{goal.ActivityAnimationId}' is not registered and enabled.");

        private VulcanusMapAnchor Anchor(RoutinePlace place) =>
            _maps.TryGetAnchor(place.AnchorId, out var anchor)
                ? anchor
                : throw new InvalidOperationException($"Map '{place.MapId}' has no anchor '{place.AnchorId}'.");

        private Vector2 AnchorFeet(RoutinePlace place) => Anchor(place).transform.position;

        private static Vector2 Cardinal(Vector2 direction) =>
            Mathf.Abs(direction.x) >= Mathf.Abs(direction.y)
                ? (direction.x >= 0 ? Vector2.right : Vector2.left)
                : (direction.y >= 0 ? Vector2.up : Vector2.down);

        private static void PlaceFeet(GameCharacter character, Vector2 feet)
        {
            character.transform.position = feet - NavigationPlan.FeetOffset(character);
            Physics2D.SyncTransforms();
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
