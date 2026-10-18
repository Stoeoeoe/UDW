using Core;
using Core.Events;
using Core.TimeAndWeather;
using Character.Animations;
using UnityEngine;
using Interaction.Tools.Stamina;
using System;

namespace Character
{
    /// <summary>Player identity, save binding and day-transition participation.</summary>
    public class MainCharacter : GameCharacter, IEventListener<DayTransitionStarted>, IEventListener<DayTransitionFinished>,
        IEventListener<OvernightRestCompleted>, IEventListener<StaminaDepletedEvent>
    {
        [SerializeField] private CharacterAnimation passOutAnimation;
        public CharacterAnimation PassOutAnimation => passOutAnimation;

        private static MainCharacter _currentMainCharacter;
        public static MainCharacter CurrentMainCharacter
        {
            get
            {
                if (!_currentMainCharacter) _currentMainCharacter = FindFirstObjectByType<MainCharacter>();
                return _currentMainCharacter;
            }
        }

        public int CurrentSelectedSlotIndex => Loadout.ActiveHandInventoryIndex;
        private readonly object _dayTransitionBlock = new();

        protected override void Awake()
        {
            _currentMainCharacter = this;
            base.Awake();
        }

        protected override void Start()
        {
            CharacterManager.Instance.RegisterMainCharacter(this);
            base.Start();
        }
        protected override void InitializeCharacterState() => PlayerStateManager.Instance.InitializeCharacter(this);

        public override void ValidateConfiguration()
        {
            base.ValidateConfiguration();
            if (!PerformPrimaryAction)
                throw new InvalidOperationException($"Main character '{name}' requires its primary action ability.");
            if (!passOutAnimation)
                throw new InvalidOperationException("The player requires its pass-out animation.");
            passOutAnimation.ValidateAsOneShot();
        }

        private void OnEnable()
        {
            this.Subscribe<DayTransitionStarted>();
            this.Subscribe<DayTransitionFinished>();
            this.Subscribe<OvernightRestCompleted>();
            this.Subscribe<StaminaDepletedEvent>();
        }

        private void OnDisable()
        {
            this.Unsubscribe<DayTransitionStarted>();
            this.Unsubscribe<DayTransitionFinished>();
            this.Unsubscribe<OvernightRestCompleted>();
            this.Unsubscribe<StaminaDepletedEvent>();
            SetControlBlocked(_dayTransitionBlock, false);
        }

        protected override void OnDestroy()
        {
            base.OnDestroy();
            if (_currentMainCharacter == this) _currentMainCharacter = null;
        }

        public void OnEvent(DayTransitionStarted change)
        {
            if (change.Character != this) return;
            SetControlBlocked(_dayTransitionBlock, true);
            PerformPrimaryAction.InterruptAction();
            Occupation.ReleaseImmediately();
            SetMovementState(MovementState.Idle);
        }

        public void OnEvent(DayTransitionFinished change)
        {
            if (change.Character != this) return;
            SetControlBlocked(_dayTransitionBlock, false);
        }

        /// <summary>Exhausting the player ends the day through the same pass-out sequence as staying up too late.</summary>
        public void OnEvent(StaminaDepletedEvent change)
        {
            if (change.Character == this && ConditionState != ConditionState.Dead)
                UrTimeManager.Instance.EndDay(DayEndReason.PassedOut);
        }

        /// <summary>Restores health and replaces last night's stamina surplus with this night's recovery.</summary>
        public void OnEvent(OvernightRestCompleted change)
        {
            if (change.Character != this) return;
            var staminaPercent = change.Reason switch
            {
                DayEndReason.PassedOut => 60,
                DayEndReason.Sleep => change.BedtimeHour < 21 ? 120 : change.BedtimeHour < 23 ? 110 : 100,
                _ => throw new ArgumentOutOfRangeException(nameof(change.Reason))
            };
            Health.RestoreToFull();
            Stamina.RecoverFromRest(staminaPercent);
        }
    }
}
