using System;
using Core.Events;
using Core.Game;
using Core.Spawning;
using Core.TimeAndWeather;

namespace Core.Items
{
    [Serializable]
    public sealed class ForagePickupState : SpawnedObjectState
    {
        public int expiresOnDay;

        public bool IsExpired(int day) => day >= expiresOnDay;
        public void Validate()
        {
            if (expiresOnDay < 2) throw new FormatException("The save contains an invalid forage expiration day.");
        }
    }

    /// <summary>The saved lifetime of one ground pickup, including forage placed directly in a map.</summary>
    public sealed class ForagePickup : SpawnedObject, IEventListener<NewDayEvent>
    {
        private ForagePickupState _state;
        public bool IsExpired => _state.IsExpired(GameState.Time.daysSinceStart);

        public override SpawnedObjectState CreateState() => new ForagePickupState
        {
            expiresOnDay = checked(GameState.Time.daysSinceStart + GetComponent<PickupableInteractable>().Item.GroundLifetimeDays)
        };

        protected override void OnStateBound()
        {
            _state = (ForagePickupState)State;
        }

        private void OnEnable()
        {
            if (IsExpired) { Remove(); return; }
            EventBus<NewDayEvent>.Subscribe(this);
        }

        private void OnDisable() => EventBus<NewDayEvent>.Unsubscribe(this);
        public void OnEvent(NewDayEvent change)
        {
            if (_state.IsExpired(change.Day)) Remove();
        }
    }
}
