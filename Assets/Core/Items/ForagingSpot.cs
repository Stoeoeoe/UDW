using System;
using Core.Events;
using Core.Game;
using Core.Location;
using Core.Spawning;
using Core.TimeAndWeather;
using UnityEngine;
using Util;
using VContainer;
using Random = UnityEngine.Random;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace Core.Items
{
    [Serializable]
    public sealed class ForagingSpotState : SpawnedObjectState
    {
        public int lastProcessedDay = -1;
        public string forageId;

        public void Validate()
        {
            if (lastProcessedDay < -1 || lastProcessedDay == 0 ||
                forageId != null && (string.IsNullOrWhiteSpace(forageId) || lastProcessedDay == -1))
                throw new FormatException("The save contains invalid forage spot state.");
        }
    }

    /// <summary>An invisible saved marker that rolls one forage pickup per day while empty.</summary>
    public sealed class ForagingSpot : SpawnedObject, IEventListener<NewDayEvent>
    {
        [Inject] private GameState _gameState;

        [Inject] private LevelManager _levelManager;

        [SerializeField, Range(0f, 1f)] private float dailySpawnChance = 0.6f;
        [SerializeField] private WeightedList<ForagePickup> forage = new();

        public WeightedList<ForagePickup> Forage => forage;
        public float DailySpawnChance => dailySpawnChance;

        private ForagingSpotState _state;
        private string _locationId;
        [Inject] private WorldObjectSpawner _spawner;

        public override SpawnedObjectState CreateState(int currentDay) => new ForagingSpotState();

        protected override void OnStateBound()
        {
            _state = (ForagingSpotState)State;
            _locationId = _levelManager.CurrentLocationData.id;
        }

        private void OnEnable()
        {
            EventBus<NewDayEvent>.Subscribe(this);
            Refresh(_gameState.Time.daysSinceStart);
        }

        private void OnDisable() => EventBus<NewDayEvent>.Unsubscribe(this);

        public void OnEvent(NewDayEvent change) => Refresh(change.Day);

        public void Refresh(int day)
        {
            if (_state.lastProcessedDay >= day) return;

            // Record occupied and unsuccessful days too, preventing extra rolls on re-entry.
            _state.lastProcessedDay = day;

            if (_state.forageId != null &&
                _gameState.World.TryGet(_locationId, _state.forageId, out SpawnedObjectState existing))
            {
                var pickupState = (ForagePickupState)existing;
                if (!pickupState.IsExpired(day)) return;

                // The spot may receive NewDayEvent before its pickup.
                _spawner.Despawn(_state.forageId);
            }

            _state.forageId = null;
            // Random.value can return exactly 1, so 100% must bypass the roll.
            if (dailySpawnChance < 1f && Random.value >= dailySpawnChance) return;

            var spawned = _spawner.Spawn(forage.GetRandomItem(), transform.position);
            _state.forageId = spawned.PersistentId;
        }

#if UNITY_EDITOR
        private void OnDrawGizmos()
        {
            Gizmos.color = new Color(0.6f, 0.85f, 0.2f);
            Gizmos.DrawWireSphere(transform.position, 0.3f);
            Handles.Label(transform.position + Vector3.up * 0.4f, "Foraging spot");
        }
#endif
    }
}
