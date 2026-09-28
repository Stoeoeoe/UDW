using System;
using System.Collections.Generic;
using System.Linq;
using Character.Abilities;
using Core;
using Core.Inventory;
using Core.Location;
using Core.Tile;
using Core.Tile.TileHighlight;
using Interaction;
using Interaction.Tools;
using Interaction.Tools.Stamina;
using Items;
using JetBrains.Annotations;
using UnityEngine;

namespace Character
{
    /// <summary>
    /// Base class for all characters. 
    /// Owns state, components, and game-specific data. Drives nothing itself — abilities do that.
    /// </summary>
    public class GameCharacter : MonoBehaviour, ILocationLifecycle
    {
        public enum LifecycleState
        {
            Booting,
            Initialized,
            SceneUnloading,
            SceneReady
        }

        // ── Serialized refs ─────────────────────────────────────────────────────────

        [SerializeField] protected UrCharacterAnimator animator;
        [SerializeField] protected InteractionSensor interactionSensor;
        [SerializeField] protected CharacterPerformPrimaryActionAbility performPrimaryActionAbility;
        [SerializeField] protected TileHighlighter tileHighlighter;
        [SerializeField] protected Transform toolInteractionAnchor;
        [SerializeField] protected Transform characterCenter;
        [SerializeField] protected bool pollTileDataEveryFrame;
        [SerializeField] protected ActionRegistry actionRegistry;
        [SerializeField] protected ToolActionRegistry toolActionRegistry;
        [SerializeField] protected GameObject characterGraphicsGo;
        [SerializeField] protected GameObject abilitiesGo;

        [field: SerializeField] public Controller2D Controller { get; private set; }
        [field: SerializeField] public Orientation2D Orientation { get; private set; }

        [PixelCrushers.DialogueSystem.ActorPopup(true)] [SerializeField] protected string actor;
        [field: SerializeField] protected Stamina Stamina { get; private set; }

        [Header("Attributes")]
        [SerializeField] private CharacterAttribute maxHealth = new CharacterAttribute(100f);
        [SerializeField] private CharacterAttribute maxStamina = new CharacterAttribute(100f);
        [SerializeField] private CharacterAttribute physicalDefense = new CharacterAttribute(0f);
        [SerializeField] private CharacterAttribute walkSpeed = new CharacterAttribute(4f);
        [SerializeField] private CharacterAttribute runSpeed = new CharacterAttribute(7f);

        // ── State ────────────────────────────────────────────────────────────────────

        public MovementState MovementState { get; private set; } = MovementState.Invalid;
        public ConditionState ConditionState { get; private set; } = ConditionState.Normal;

        public event Action<MovementState> OnMovementStateChanged;
        public event Action<ConditionState> OnConditionStateChanged;

        public bool IsFrozen => ConditionState == ConditionState.Frozen;
        public bool IsRuntimeInitialized { get; private set; }
        public LifecycleState CurrentLifecycleState { get; private set; } = LifecycleState.Booting;

        // ── Game data accessors ──────────────────────────────────────────────────────

        public UrCharacterAnimator Animator => animator;
        public InteractionSensor InteractionSensor => interactionSensor;
        public TileHighlighter TileHighlighter => tileHighlighter;
        public Transform ToolInteractionAnchor => toolInteractionAnchor;
        public Transform CharacterCenter => characterCenter;
        public CharacterPerformPrimaryActionAbility PerformPrimaryAction => performPrimaryActionAbility;

        public ToolData CurrentTool => CurrentlyHeldItem as ToolData;
        public EquippableItem CurrentlyHeldItem { get; protected set; }
        public ActionRegistry ActionRegistry => actionRegistry;
        public ToolActionRegistry ToolActionRegistry => toolActionRegistry;

        public SlotInventory MainInventory { get; private set; }

        public CharacterSkills Skills { get; private set; } = new CharacterSkills();

        public int MaxHealth => Mathf.RoundToInt(maxHealth.Value);
        public int MaxStamina => Mathf.RoundToInt(maxStamina.Value);
        public int PhysicalDefense => Mathf.RoundToInt(physicalDefense.Value);
        public float WalkSpeed => walkSpeed.Value;
        public float RunSpeed => runSpeed.Value;

        public void SetMaxHealthModifier(string sourceId, float flat = 0f, float percent = 0f) =>
            maxHealth.SetModifier(sourceId, flat, percent);

        public bool RemoveMaxHealthModifier(string sourceId) => maxHealth.RemoveModifier(sourceId);

        public void SetPhysicalDefenseModifier(string sourceId, float flat = 0f, float percent = 0f) =>
            physicalDefense.SetModifier(sourceId, flat, percent);

        public bool RemovePhysicalDefenseModifier(string sourceId) => physicalDefense.RemoveModifier(sourceId);

        public void SetMaxStaminaModifier(string sourceId, float flat = 0f, float percent = 0f)
        {
            var previous = MaxStamina;
            maxStamina.SetModifier(sourceId, flat, percent);
            if (MaxStamina != previous) Stamina?.RefreshMaximum();
        }

        public bool RemoveMaxStaminaModifier(string sourceId)
        {
            var previous = MaxStamina;
            var removed = maxStamina.RemoveModifier(sourceId);
            if (MaxStamina != previous) Stamina?.RefreshMaximum();
            return removed;
        }

        public void SetWalkSpeedModifier(string sourceId, float flat = 0f, float percent = 0f) =>
            walkSpeed.SetModifier(sourceId, flat, percent);

        public bool RemoveWalkSpeedModifier(string sourceId) => walkSpeed.RemoveModifier(sourceId);

        public void SetRunSpeedModifier(string sourceId, float flat = 0f, float percent = 0f) =>
            runSpeed.SetModifier(sourceId, flat, percent);

        public bool RemoveRunSpeedModifier(string sourceId) => runSpeed.RemoveModifier(sourceId);

        [CanBeNull] public TileData CurrentTileData { get; private set; }

        public Vector2Int CurrentTileCoordinates =>
            MapManager.Instance.GetCurrentTileCoordinates(this);

        public AbstractInteractable CurrentInteractable =>
            interactionSensor != null ? interactionSensor.Current : null;

        [CanBeNull]
        public TileData TileDataInFront =>
            MapManager.Instance.GetTileDataInDirectionOfCharacter(this, Controller.CurrentDirection);

        [CanBeNull]
        public TileData TileDataInBack =>
            MapManager.Instance.GetTileDataInDirectionOfCharacter(this, -Controller.CurrentDirection);

        // ── Lifecycle ────────────────────────────────────────────────────────────────

        protected virtual void Awake()
        {
            Controller = GetComponent<Controller2D>();
            Orientation = GetComponent<Orientation2D>();

            Abilities = abilitiesGo.GetComponents<CharacterAbility>().ToList();
            characterGraphicsGo.SetActive(false);

            LevelManager.Instance?.RegisterLifecycle(this);
        }

        // ── Helpers ────────────────────────────────────────────────────────────────
        private bool _sceneReady;

        protected virtual void Start()
        {
            // Initialization now happens in OnLocationEnter, called by LevelManager
        }

        private void OnDestroy()
        {
            LevelManager.Instance?.UnregisterLifecycle(this);
        }

        public void EnsureRuntimeInitialized()
        {
            InitializeRuntimeSystems();
        }

        private void InitializeRuntimeSystems()
        {
            if (IsRuntimeInitialized)
                return;

            MainInventory = SlotInventory.FindInventory("MainInventory", "Player1");

            toolActionRegistry.Initialize(this);
            actionRegistry.Initialize(this);
            PlayerStateManager.Instance.InitializeCharacter(this);

            IsRuntimeInitialized = true;
            CurrentLifecycleState = LifecycleState.Initialized;
        }


        protected virtual void Update()
        {
            if (!_sceneReady) return;

            foreach (var ability in Abilities)
            {
                ability.Tick();
            }

            if (pollTileDataEveryFrame && MovementState != MovementState.Idle)
                CheckCurrentTileData();
        }

        protected void LateUpdate()
        {
            if (!_sceneReady) return;


            foreach (var ability in Abilities)
            {
                ability.TickLate();
            }
        }

        // ── State API ────────────────────────────────────────────────────────────────

        public void SetMovementState(MovementState state)
        {
            if (MovementState == state) return;
            MovementState = state;
            OnMovementStateChanged?.Invoke(state);
        }

        public void SetConditionState(ConditionState state)
        {
            if (ConditionState == state) return;
            ConditionState = state;
            if (state == ConditionState.Frozen) Controller.Stop();
            OnConditionStateChanged?.Invoke(state);
        }

        public void Freeze() => SetConditionState(ConditionState.Frozen);
        public void UnFreeze() => SetConditionState(ConditionState.Normal);

        // ── Abilities ───────────────────────────────────────────────────────────────────

        protected List<CharacterAbility> Abilities = new();

        /// <summary>Finds the first ability of type T on this character. Cached by abilities themselves on Awake.</summary>
        public T GetAbility<T>() where T : CharacterAbility
        {
            foreach (var a in Abilities)
                if (a is T typed)
                    return typed;
            return GetComponentInChildren<T>();
        }

        // ── Item helpers ─────────────────────────────────────────────────────────────

        protected void SetHeldItem(EquippableItem item) => CurrentlyHeldItem = item;

        public void Unequip(EquippableItem item)
        {
            if (CurrentlyHeldItem == item)
                CurrentlyHeldItem = null;
        }

        public List<TileData> TilesAround(int size)
        {
            var relativeTiles = new Vector2Int[(size * 2 + 1) * (size * 2 + 1) - 1];
            int index = 0;
            for (int x = -size; x <= size; x++)
            for (int y = -size; y <= size; y++)
            {
                if (x == 0 && y == 0) continue;
                relativeTiles[index++] = new Vector2Int(x, y);
            }

            return MapManager.Instance.GetTileDataAround(this, relativeTiles);
        }

        // ── Energy API ────────────────────────────────────────────────────────────────

        public void ConsumeStamina(int amount) => Stamina?.ConsumeStamina(amount);
        public void InitializeStamina(int value) => Stamina?.Initialize(value);

        // ── Tile tracking ─────────────────────────────────────────────────────────────

        void CheckCurrentTileData()
        {
            var tileData = MapManager.Instance.GetTileDataBelowCharacter(this);
            if (tileData == CurrentTileData) return;
            CurrentTileData = tileData;
            CharacterChangedTileEvent.Trigger(tileData, this);
        }

        public void OnLocationEnter(LocationData location)
        {
            EnsureRuntimeInitialized();
            animator.OnLocationEnter(location);
            characterGraphicsGo.SetActive(true);
            _sceneReady = true;
            CurrentLifecycleState = LifecycleState.SceneReady;
            SetMovementState(MovementState.Idle);
        }

        public void OnLocationLeave(LocationData location)
        {
            _sceneReady = false;
            CurrentLifecycleState = LifecycleState.SceneUnloading;
            animator.OnLocationLeave(location);
            characterGraphicsGo.SetActive(false);
        }

        public void InitializeSkills(CharacterSkills skills)
        {
            Skills = skills ?? throw new ArgumentNullException(nameof(skills));
        }
    }
}
