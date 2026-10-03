using System.Collections;
using Character;
using Core.Events;
using Core.Game;
using Core.Location;
using Core.TimeAndWeather;
using MoreMountains.Feedbacks;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Interaction
{
    /// <summary>Contact, availability, persistence and feedback for an interactable.</summary>
    [RequireComponent(typeof(Collider2D))]
    public abstract class AbstractInteractable : MonoBehaviour, IEventListener<GameTimeChangedEvent>, ILocationLifecycle
    {
        [Header("Interaction")]
        [Tooltip("If false, triggers on contact (walk-in portals). If true, player must press Interact.")]
        [SerializeField] private bool requiresButtonPress = true;

        [Header("Activations")]
        [SerializeField] protected bool UnlimitedActivations = true;
        [Min(0)] [SerializeField] protected int MaxNumberOfActivations = 1;

        [Header("Cooldowns")]
        [LabelText("Cooldown Type")]
        [SerializeField] protected InteractionCooldownMode cooldownMode;
        [ShowIf(nameof(UsesSecondsCooldown))]
        [LabelText("Seconds")]
        [Tooltip("Seconds while the game is running. Gameplay Seconds follows game speed; Real Time Seconds ignores pause and slow motion. Not saved.")]
        [Min(0)] [SerializeField] protected float cooldown;
        [ShowIf(nameof(cooldownMode), InteractionCooldownMode.InGameHours)]
        [LabelText("Hours")]
        [Tooltip("Elapsed in-game hours. Saved; 24 means a full in-game day.")]
        [Min(0)] [SerializeField] protected int inGameHourCooldown;
        [ShowIf(nameof(cooldownMode), InteractionCooldownMode.UntilTime)]
        [LabelText("Until")]
        [SerializeField] protected GameTimeBoundary cooldownBoundary;
        [Tooltip("Stable ID unique to this placed object within its location. Required for limited uses, in-game hours or a calendar cooldown.")]
        [SerializeField] private string persistentId;

        [Header("Feedbacks")]
        [SerializeField] protected MMFeedbacks ActivationFeedback;
        [SerializeField] protected MMFeedbacks DeniedFeedback;
        [SerializeField] protected MMFeedbacks EnterFeedback;
        [SerializeField] protected MMFeedbacks ExitFeedback;

        [Tooltip("Remove the whole interactable when its limited uses are exhausted.")]
        [SerializeField] private bool DestroyWhenUsedUp;

        private readonly Cooldown _secondsCooldown = new();
        private Coroutine _realTimeCooldownRefresh;
        private InteractableVisuals _visuals;
        private InteractionState? _lastState;
        private int _lastRemainingUses;
        private string _locationId;
        private bool _destroyQueued;

        private bool UsesSecondsCooldown => cooldownMode == InteractionCooldownMode.GameplaySeconds ||
                                            cooldownMode == InteractionCooldownMode.RealTimeSeconds;
        private bool UsesSavedCooldown => cooldownMode == InteractionCooldownMode.UntilTime ||
            cooldownMode == InteractionCooldownMode.InGameHours && inGameHourCooldown > 0;
        private bool NeedsSavedState => !UnlimitedActivations || UsesSavedCooldown;
        private float SecondsClock => cooldownMode == InteractionCooldownMode.RealTimeSeconds ? Time.unscaledTime : Time.time;
        private string StateObjectId => "interactable:" + persistentId;

        public virtual bool RequiresButtonPress => requiresButtonPress;
        public virtual bool CanInteract => EvaluateState(out _) == InteractionState.Ready;

        /// <summary>Uses left; -1 means unlimited.</summary>
        public int RemainingUses
        {
            get
            {
                EvaluateState(out var remainingUses);
                return remainingUses;
            }
        }

        protected virtual void Awake()
        {
            _visuals = GetComponent<InteractableVisuals>();
            if (NeedsSavedState && string.IsNullOrWhiteSpace(persistentId))
                Debug.LogError($"[AbstractInteractable] '{name}' needs a stable persistent ID.", this);
        }

        protected virtual void OnEnable()
        {
            if (UsesSavedCooldown)
                EventBus<GameTimeChangedEvent>.Subscribe(this);
            LevelManager.Instance?.RegisterLifecycle(this);
            ScheduleCooldownRefresh();
            RefreshState();
        }

        protected virtual void OnDisable()
        {
            EventBus<GameTimeChangedEvent>.Unsubscribe(this);
            LevelManager.Instance?.UnregisterLifecycle(this);
            _locationId = null;
            CancelInvoke(nameof(OnCooldownExpired));
            if (_realTimeCooldownRefresh != null)
                StopCoroutine(_realTimeCooldownRefresh);
            _realTimeCooldownRefresh = null;
            _visuals?.Show(InteractionState.Unavailable);
        }

        public void OnLocationEnter(LocationData location)
        {
            _locationId = location?.id;
            RefreshState();
        }

        public void OnLocationLeave(LocationData location)
        {
            _locationId = null;
            RefreshState();
        }

        public void OnEvent(GameTimeChangedEvent change) => RefreshState();

        public virtual void TriggerInteraction(GameCharacter instigator)
        {
            if (!CanInteract) { DeniedFeedback?.PlayFeedbacks(); return; }

            RecordActivation();
            StartCooldown();
            ActivationFeedback?.PlayFeedbacks();
            Interact(instigator);
            RefreshState(forceNotify: true);
        }

        protected abstract void Interact(GameCharacter instigator);

        private InteractionState EvaluateState(out int remainingUses)
        {
            remainingUses = UnlimitedActivations ? -1 : 0;
            if (LevelManager.Instance != null && string.IsNullOrEmpty(_locationId))
                return InteractionState.Unavailable;
            if (NeedsSavedState)
            {
                if (!TryGetSavedState(out _, out var savedState)) return InteractionState.Unavailable;
                if (!UnlimitedActivations)
                {
                    remainingUses = Mathf.Max(0, MaxNumberOfActivations - (savedState?.uses ?? 0));
                    if (remainingUses == 0) return InteractionState.UsedUp;
                }
                if (UsesSavedCooldown)
                {
                    if (!GameState.Time.initialized) return InteractionState.Unavailable;
                    if (cooldownMode == InteractionCooldownMode.UntilTime && UrTimeManager.Instance == null)
                        return InteractionState.Unavailable;
                    if (savedState != null && savedState.IsCoolingDown(GameState.Time.TotalMinutes))
                        return InteractionState.CoolingDown;
                }
            }

            return UsesSecondsCooldown && _secondsCooldown.IsActive(SecondsClock)
                ? InteractionState.CoolingDown : InteractionState.Ready;
        }

        private bool TryGetSavedState(out string locationId, out InteractableState state)
        {
            locationId = _locationId;
            state = null;
            if (GameStateManager.Instance == null || string.IsNullOrWhiteSpace(persistentId) ||
                string.IsNullOrWhiteSpace(locationId)) return false;
            GameState.World.TryGet(locationId, StateObjectId, out state);
            return true;
        }

        private void RecordActivation()
        {
            if (!NeedsSavedState) return;
            TryGetSavedState(out var locationId, out var previous);
            var state = new InteractableState
            {
                availableAtMinute = cooldownMode switch
                {
                    InteractionCooldownMode.InGameHours => GameState.Time.TotalMinutes + (long)inGameHourCooldown * 60,
                    InteractionCooldownMode.UntilTime => UrTimeManager.Instance.GetNextBoundaryMinute(cooldownBoundary),
                    _ => 0
                }
            };
            state.uses = (previous?.uses ?? 0) + 1;
            GameState.World.Set(locationId, StateObjectId, state);
        }

        private void StartCooldown()
        {
            if (!UsesSecondsCooldown) return;
            _secondsCooldown.Start(SecondsClock, cooldown);
            ScheduleCooldownRefresh();
        }

        private void ScheduleCooldownRefresh()
        {
            CancelInvoke(nameof(OnCooldownExpired));
            if (_realTimeCooldownRefresh != null)
                StopCoroutine(_realTimeCooldownRefresh);
            _realTimeCooldownRefresh = null;
            if (!UsesSecondsCooldown || !_secondsCooldown.IsActive(SecondsClock)) return;
            if (cooldownMode == InteractionCooldownMode.RealTimeSeconds)
                _realTimeCooldownRefresh = StartCoroutine(RefreshAfterRealTimeCooldown());
            else
                Invoke(nameof(OnCooldownExpired), _secondsCooldown.Remaining(SecondsClock));
        }

        private IEnumerator RefreshAfterRealTimeCooldown()
        {
            yield return new WaitForSecondsRealtime(_secondsCooldown.Remaining(SecondsClock));
            _realTimeCooldownRefresh = null;
            RefreshState();
        }

        private void OnCooldownExpired() => RefreshState();

        private void RefreshState(bool forceNotify = false)
        {
            var state = EvaluateState(out var remainingUses);
            var changed = _lastState.HasValue &&
                          (state != _lastState.Value || remainingUses != _lastRemainingUses);
            _lastState = state;
            _lastRemainingUses = remainingUses;

            if (state == InteractionState.UsedUp && DestroyWhenUsedUp && Application.isPlaying)
            {
                if (!_destroyQueued)
                {
                    _destroyQueued = true;
                    Destroy(gameObject);
                }
            }
            else
            {
                _visuals?.Show(state);
            }

            if (changed || forceNotify)
                InteractableStateChangedEvent.Trigger(this, remainingUses);
        }

        protected virtual void OnTriggerEnter2D(Collider2D other)
        {
            var character = other.GetComponentInParent<GameCharacter>();
            if (!character) return;
            OnCharacterEntered(character);
            if (!RequiresButtonPress) TriggerInteraction(character);
        }

        protected virtual void OnTriggerExit2D(Collider2D other)
        {
            var character = other.GetComponentInParent<GameCharacter>();
            if (character) OnCharacterExited(character);
        }

        protected virtual void OnCharacterEntered(GameCharacter character) => EnterFeedback?.PlayFeedbacks();
        protected virtual void OnCharacterExited(GameCharacter character) => ExitFeedback?.PlayFeedbacks();
    }
}
