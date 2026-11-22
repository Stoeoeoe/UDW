using System;
using System.Collections;
using System.Collections.Generic;
using Character;
using Core.Context;
using Core.Events;
using Core.Game;
using Core.Location;
using Core.Tile;
using Core.TimeAndWeather;
using MoreMountains.Feedbacks;
using Sirenix.OdinInspector;
using UnityEngine;
using VContainer;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace Interaction
{
    /// <summary>Contact, availability, persistence and feedback for an interactable.</summary>
    [RequireComponent(typeof(Collider2D))]
    public abstract class AbstractInteractable : MonoBehaviour, IEventListener<GameTimeChangedEvent>
    {
        [Inject] private GameState _gameState;

        [Inject] private PlayerInteractionContext _playerInteractionContext;
        [Inject] protected CharacterManager _characterManager;
        [Inject] protected GameClock _clock;
        [Inject] protected LevelManager _levelManager;
        [Inject] private MapManager _map;

        [Header("Interaction")]
        [Tooltip("If false, triggers on contact (walk-in portals). If true, player must press Interact.")]
        [SerializeField] private bool requiresButtonPress = true;
        [Tooltip("The object that holds this interactable's sprites and solid colliders. The pointer hovers the visible " +
                 "pixels of its sprites; its solid colliders are the tiles that must be next to the player. Leave empty " +
                 "for things without their own art, such as doors: the interaction collider is then used for both.")]
        [SerializeField] private Transform target;

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
        [Tooltip("Stable object name plus a globally unique UUID. Renaming the GameObject does not change this ID. Regenerate after duplication; never change it for an existing saved object.")]
        [ReadOnly] [SerializeField] private string persistentId;

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
        private bool _destroyQueued;
        private InteractableState _bound;
        private Collider2D _interactionCollider;
        private static readonly List<SpriteRenderer> TargetSprites = new();
        private static readonly List<Collider2D> FootprintBuffer = new();
        // Keeps a collider edge that lies exactly on a tile border from reaching into the next tile.
        private static readonly Vector3 TileEdgeInset = new(0.01f, 0.01f, 0f);

        private bool UsesSecondsCooldown => cooldownMode == InteractionCooldownMode.GameplaySeconds ||
                                            cooldownMode == InteractionCooldownMode.RealTimeSeconds;
        private bool UsesSavedCooldown => cooldownMode == InteractionCooldownMode.UntilTime ||
            cooldownMode == InteractionCooldownMode.InGameHours && inGameHourCooldown > 0;
        private bool NeedsSavedState => !UnlimitedActivations || UsesSavedCooldown;
        private float SecondsClock => cooldownMode == InteractionCooldownMode.RealTimeSeconds ? Time.unscaledTime : Time.time;

        public string PersistentId => persistentId;
        public event Action Depleted;

        /// <summary>The spawner supplies identity and the entity-owned interaction record before enabling.</summary>
        internal void BindSpawnedState(string id, InteractableState state)
        {
            if (gameObject.activeInHierarchy)
                throw new InvalidOperationException("Bind a spawned interactable before enabling it.");
            persistentId = id;
            _bound = state;
        }

#if UNITY_EDITOR
        protected virtual void OnValidate()
        {
            if (_bound != null) return; // Authored map IDs are stable strings, not necessarily UUIDs.
            // Keep valid stored IDs unchanged, even if the GameObject is renamed.
            if (!Guid.TryParseExact(persistentId, "N", out _) &&
                (string.IsNullOrEmpty(persistentId) || persistentId.Length < 36 ||
                 !Guid.TryParseExact(persistentId.Substring(persistentId.Length - 36), "D", out _)))
                persistentId = CreatePersistentId();
        }

        private string CreatePersistentId() => $"{gameObject.name.Replace(' ', '_')}_{Guid.NewGuid():D}";

        [Button("Regenerate Persistent UUID")]
        private void RegeneratePersistentId()
        {
            Undo.RecordObject(this, "Regenerate interactable UUID");
            persistentId = CreatePersistentId();
            EditorUtility.SetDirty(this);
            PrefabUtility.RecordPrefabInstancePropertyModifications(this);
        }

        private static readonly Color HoverGizmoColor = new(0.3f, 0.85f, 1f);
        private static readonly Color FootprintGizmoColor = new(1f, 0.8f, 0.2f);

        // Cyan: what the pointer hovers. Yellow: the footprint whose tiles must be next to the player.
        private void OnDrawGizmosSelected()
        {
            var interactionCollider = GetComponent<Collider2D>();
            if (!interactionCollider) return;
            Gizmos.color = HoverGizmoColor;
            if (target)
            {
                Gizmos.DrawLine(transform.position, target.position);
                foreach (var sprite in target.GetComponentsInChildren<SpriteRenderer>())
                    if (sprite.sprite) Gizmos.DrawWireCube(sprite.bounds.center, sprite.bounds.size);
            }
            else Gizmos.DrawWireCube(interactionCollider.bounds.center, interactionCollider.bounds.size);

            Gizmos.color = FootprintGizmoColor;
            foreach (var footprint in Footprint(interactionCollider))
                Gizmos.DrawWireCube(footprint.bounds.center, footprint.bounds.size + new Vector3(0.04f, 0.04f));
            Handles.Label(transform.position, target ? $"Target: {target.name}" : "Target: interaction collider");
        }
#endif

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

        /// <summary>For interactables whose art is built at runtime; authored ones set the target in the Inspector.</summary>
        protected void SetTarget(Transform value) => target = value;

        /// <summary>Fills the list with the target's active sprites; empty without a target.</summary>
        public void GetTargetSprites(List<SpriteRenderer> result)
        {
            result.Clear();
            if (target) target.GetComponentsInChildren(false, result);
        }

        /// <summary>Whether the point is over a visible pixel of the target's sprites, or inside the interaction collider without a target.</summary>
        public bool IsUnderPointer(Vector2 point)
        {
            if (!target) return _interactionCollider.OverlapPoint(point);
            target.GetComponentsInChildren(false, TargetSprites);
            foreach (var sprite in TargetSprites)
                if (sprite.enabled && IsOpaquePixel(sprite, point)) return true;
            return false;
        }

        /// <summary>Whether a tile the footprint covers is the character's tile or one of the eight around it.</summary>
        public bool IsWithinReach(Vector2Int characterTile)
        {
            foreach (var footprint in Footprint(_interactionCollider))
            {
                var bounds = footprint.bounds;
                var min = _map.WorldToTileCoordinates(bounds.min + TileEdgeInset);
                var max = _map.WorldToTileCoordinates(bounds.max - TileEdgeInset);
                var dx = Mathf.Max(min.x - characterTile.x, 0, characterTile.x - max.x);
                var dy = Mathf.Max(min.y - characterTile.y, 0, characterTile.y - max.y);
                if (dx <= 1 && dy <= 1) return true;
            }
            return false;
        }

        /// <summary>The footprint point nearest to the given point; the point itself when it is inside.</summary>
        public Vector2 ClosestFootprintPoint(Vector2 point)
        {
            var closest = point;
            var best = float.PositiveInfinity;
            foreach (var footprint in Footprint(_interactionCollider))
            {
                var candidate = footprint.ClosestPoint(point);
                var distance = (candidate - point).sqrMagnitude;
                if (distance >= best) continue;
                best = distance;
                closest = candidate;
            }
            return closest;
        }

        // The target's enabled solid colliders, or the interaction collider when there are none.
        // Returns a shared buffer: read it before the next call.
        private List<Collider2D> Footprint(Collider2D interactionCollider)
        {
            FootprintBuffer.Clear();
            if (target)
            {
                target.GetComponentsInChildren(false, FootprintBuffer);
                FootprintBuffer.RemoveAll(collider => collider.isTrigger || !collider.enabled);
            }
            if (FootprintBuffer.Count == 0) FootprintBuffer.Add(interactionCollider);
            return FootprintBuffer;
        }

        private static bool IsOpaquePixel(SpriteRenderer renderer, Vector2 point)
        {
            var sprite = renderer.sprite;
            if (!sprite) return false;
            var bounds = renderer.bounds;
            if (!bounds.Contains(new Vector3(point.x, point.y, bounds.center.z))) return false;
            var local = (Vector2)renderer.transform.InverseTransformPoint(point);
            if (renderer.flipX) local.x = -local.x;
            if (renderer.flipY) local.y = -local.y;
            // Sprite-rect pixels from the pivot, then into the texture, also for sprites packed into an atlas.
            var texel = sprite.textureRect.position - sprite.textureRectOffset + local * sprite.pixelsPerUnit + sprite.pivot;
            if (!sprite.textureRect.Contains(texel)) return false;
            if (!sprite.texture.isReadable)
                throw new InvalidOperationException(
                    $"Sprite '{sprite.name}' on '{renderer.name}' needs a readable texture (Read/Write) so the pointer can hover it.");
            return sprite.texture.GetPixel((int)texel.x, (int)texel.y).a > 0f;
        }

        protected virtual void Awake()
        {
            _interactionCollider = GetComponent<Collider2D>();
            // The player's nearby sensor finds button-press targets on this layer only.
            if (RequiresButtonPress && gameObject.layer != LayerMask.NameToLayer("Interactable"))
                throw new InvalidOperationException($"Interactable '{name}' needs a button press, so it must be on the Interactable layer.");
            _visuals = GetComponent<InteractableVisuals>();
            if (NeedsSavedState && string.IsNullOrWhiteSpace(persistentId))
                Debug.LogError($"[AbstractInteractable] '{name}' needs a stable persistent ID.", this);
        }

        protected virtual void OnEnable()
        {
            if (UsesSavedCooldown)
                EventBus<GameTimeChangedEvent>.Subscribe(this);
            ScheduleCooldownRefresh();
            RefreshState();
        }

        protected virtual void OnDisable()
        {
            EventBus<GameTimeChangedEvent>.Unsubscribe(this);
            CancelInvoke(nameof(OnCooldownExpired));
            if (_realTimeCooldownRefresh != null)
                StopCoroutine(_realTimeCooldownRefresh);
            _realTimeCooldownRefresh = null;
            _visuals?.Show(InteractionState.Unavailable);
        }

        public void OnEvent(GameTimeChangedEvent change) => RefreshState();

        public virtual void TriggerInteraction(GameCharacter instigator)
        {
            if (instigator == _characterManager.MainCharacter &&
                _playerInteractionContext.CurrentSnapshot.WorldInteractionBlocked) return;
            if (!CanInteract || !Interact(instigator))
            {
                if (DeniedFeedback) DeniedFeedback.PlayFeedbacks();
                return;
            }

            RecordActivation();
            StartCooldown();
            if (ActivationFeedback) ActivationFeedback.PlayFeedbacks();
            RefreshState(forceNotify: true);
        }

        /// <summary>Attempts the action; only success consumes a use, starts cooldown and plays activation feedback.</summary>
        protected abstract bool Interact(GameCharacter instigator);

        private InteractionState EvaluateState(out int remainingUses)
        {
            remainingUses = UnlimitedActivations ? -1 : 0;
            if (NeedsSavedState)
            {
                if (!TryGetSavedState(out var savedState)) return InteractionState.Unavailable;
                if (!UnlimitedActivations)
                {
                    remainingUses = Mathf.Max(0, MaxNumberOfActivations - (savedState?.uses ?? 0));
                    if (remainingUses == 0) return InteractionState.UsedUp;
                }
                if (UsesSavedCooldown)
                {
                    if (!_gameState.Time.initialized) return InteractionState.Unavailable;
                    if (savedState != null && savedState.IsCoolingDown(_gameState.Time.TotalMinutes))
                        return InteractionState.CoolingDown;
                }
            }

            return UsesSecondsCooldown && _secondsCooldown.IsActive(SecondsClock)
                ? InteractionState.CoolingDown : InteractionState.Ready;
        }

        private bool TryGetSavedState(out InteractableState state)
        {
            state = _bound;
            if (string.IsNullOrWhiteSpace(persistentId)) return false;
            if (state == null) _gameState.World.TryGet(persistentId, out state);
            return true;
        }

        private void RecordActivation()
        {
            if (!NeedsSavedState) return;
            TryGetSavedState(out var state);
            if (state == null) _gameState.World.Set(persistentId, state = new InteractableState());
            state.uses++;
            state.availableAtMinute = cooldownMode switch
            {
                InteractionCooldownMode.InGameHours => _gameState.Time.TotalMinutes + (long)inGameHourCooldown * 60,
                InteractionCooldownMode.UntilTime => _clock.GetNextBoundaryMinute(cooldownBoundary),
                _ => 0
            };
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
                    if (Depleted != null) Depleted();
                    else Destroy(gameObject);
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
            if (!character || character != _characterManager.MainCharacter) return;
            OnCharacterEntered(character);
            if (!RequiresButtonPress && _levelManager.SceneReady) TriggerInteraction(character);
        }

        protected virtual void OnTriggerExit2D(Collider2D other)
        {
            var character = other.GetComponentInParent<GameCharacter>();
            if (character && character == _characterManager.MainCharacter) OnCharacterExited(character);
        }

        protected virtual void OnCharacterEntered(GameCharacter character) => EnterFeedback?.PlayFeedbacks();
        protected virtual void OnCharacterExited(GameCharacter character) => ExitFeedback?.PlayFeedbacks();
    }
}
