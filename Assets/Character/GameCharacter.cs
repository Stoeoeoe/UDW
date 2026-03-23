using System;
using System.Collections.Generic;
using Animancer;
using Character.Abilities;
using Core;
using Core.Inventory;
using Core.Tile;
using Core.Tile.TileHighlight;
using Interaction;
using Interaction.Tools;
using Interaction.Tools.Stamina;
using Items;
using JetBrains.Annotations;
using PixelCrushers.DialogueSystem;
using UnityEngine;

namespace Character
{
    /// <summary>
    /// Base class for all characters. 
    /// Owns state, components, and game-specific data. Drives nothing itself — abilities do that.
    /// </summary>
    public class GameCharacter : MonoBehaviour
    {
        // ── Serialized refs ─────────────────────────────────────────────────────────

        [SerializeField] protected NamedAnimancerComponent animancer;
        [SerializeField] protected InteractionSensor interactionSensor;
        [SerializeField] protected CharacterPerformPrimaryActionAbility performPrimaryActionAbility;
        [SerializeField] protected TileHighlighter tileHighlighter;
        [SerializeField] protected Transform toolInteractionAnchor;
        [SerializeField] protected bool pollTileDataEveryFrame;
        [SerializeField] protected ActionRegistry actionRegistry;
        [SerializeField] protected ToolActionRegistry toolActionRegistry;
        [ActorPopup(true)] [SerializeField] protected string actor;
        [field: SerializeField] protected Stamina Stamina { get; private set; }

        // ── State ────────────────────────────────────────────────────────────────────

        public MovementState  MovementState  { get; private set; } = MovementState.Idle;
        public ConditionState ConditionState { get; private set; } = ConditionState.Normal;

        public event Action<MovementState>  OnMovementStateChanged;
        public event Action<ConditionState> OnConditionStateChanged;

        public bool IsFrozen => ConditionState == ConditionState.Frozen;
        public bool IsReady { get; private set; }

        // ── Components (always on same GameObject) ───────────────────────────────────

        public Controller2D  Controller  { get; private set; }
        public Orientation2D Orientation { get; private set; }

        // ── Game data accessors ──────────────────────────────────────────────────────

        public NamedAnimancerComponent Animancer             => animancer;
        public InteractionSensor       InteractionSensor     => interactionSensor;
        public TileHighlighter         TileHighlighter       => tileHighlighter;
        public Transform               ToolInteractionAnchor => toolInteractionAnchor;
        public CharacterPerformPrimaryActionAbility PerformPrimaryAction => performPrimaryActionAbility;

        public ToolData                CurrentTool           => CurrentlyHeldItem as ToolData;
        public EquippableItem          CurrentlyHeldItem     { get; protected set; }
        public ActionRegistry          ActionRegistry        => actionRegistry;
        public ToolActionRegistry      ToolActionRegistry    => toolActionRegistry;

        public SlotInventory MainInventory { get; private set; }

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
            Controller  = GetComponent<Controller2D>();
            Orientation = GetComponent<Orientation2D>();
            Initialize();
        }

        protected virtual void Initialize() { }

        protected virtual void Start()
        {
            MainInventory = SlotInventory.FindInventory("MainInventory", "Player1");

            toolActionRegistry.Initialize(this);
            actionRegistry.Initialize(this);
            PlayerStateManager.Instance.InitializeCharacter(this);

            IsReady = true;
        }

        protected virtual void Update()
        {
            if (pollTileDataEveryFrame && MovementState != MovementState.Idle)
                CheckCurrentTileData();
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

        public void Freeze()   => SetConditionState(ConditionState.Frozen);
        public void UnFreeze() => SetConditionState(ConditionState.Normal);

        // ── Ability access ───────────────────────────────────────────────────────────

        readonly List<CharacterAbility> _abilities = new();

        protected void RegisterAbility(CharacterAbility ability) => _abilities.Add(ability);

        /// <summary>Finds the first ability of type T on this character. Cached by abilities themselves on Awake.</summary>
        public T GetAbility<T>() where T : CharacterAbility
        {
            foreach (var a in _abilities)
                if (a is T typed) return typed;
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

        public void ConsumeStamina(int amount)  => Stamina?.ConsumeStamina(amount);
        public void InitializeStamina(int value) => Stamina?.Initialize(value);

        // ── Tile tracking ─────────────────────────────────────────────────────────────

        void CheckCurrentTileData()
        {
            var tileData = MapManager.Instance.GetTileDataBelowCharacter(this);
            if (tileData == CurrentTileData) return;
            CurrentTileData = tileData;
            CharacterChangedTileEvent.Trigger(tileData, this);
        }
    }
}
