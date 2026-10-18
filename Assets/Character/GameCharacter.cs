using System;
using System.Collections.Generic;
using Character.Abilities;
using Core.Inventory;
using Core.GameplayTags;
using Core.Location;
using Core.Tile;
using Core.Tile.TileHighlight;
using Interaction;
using Interaction.Tools;
using Interaction.Tools.Stamina;
using Items;
using UnityEngine;

namespace Character
{
    /// <summary>Character composition and ordered startup. Gameplay state lives with its owning subsystem.</summary>
    [RequireComponent(typeof(CharacterOccupation), typeof(Controller2D), typeof(Orientation2D))]
    [RequireComponent(typeof(CharacterTileContext), typeof(CharacterHealth))]
    [RequireComponent(typeof(CharacterBoosts))]
    public class GameCharacter : MonoBehaviour, ILocationLifecycle
    {
        [SerializeField] private UrCharacterAnimator animator;
        [SerializeField] private InteractionSensor interactionSensor;
        [SerializeField] private CharacterPerformPrimaryActionAbility performPrimaryActionAbility;
        [SerializeField] private TileHighlighter tileHighlighter;
        [SerializeField] private Transform toolInteractionAnchor;
        [SerializeField] private Transform characterCenter;
        [SerializeField] private ActionRegistry actionRegistry;
        [SerializeField] private ToolActionRegistry toolActionRegistry;
        [SerializeField] private GameObject characterGraphicsGo;
        [SerializeField] private GameObject abilitiesGo;
        [SerializeField] private CharacterAttributes attributes = new();
        [field: SerializeField] public SlotInventory MainInventory { get; private set; }
        [field: SerializeField] public Stamina Stamina { get; private set; }

        public Controller2D Controller { get; private set; }
        public Orientation2D Orientation { get; private set; }
        public CharacterTileContext Tiles { get; private set; }
        public CharacterOccupation Occupation => GetComponent<CharacterOccupation>();
        public CharacterAttributes Attributes => attributes;
        public CharacterHealth Health { get; private set; }
        public CharacterBoosts Boosts { get; private set; }
        public Wallet Wallet { get; private set; }
        public CharacterSkills Skills { get; private set; } = new();
        public TagSet Tags { get; } = new();
        public CharacterLoadout Loadout => MainInventory.Loadout;
        public EquippableItem CurrentlyHeldItem => Loadout.ActiveHandItem;
        public ToolData CurrentTool => CurrentlyHeldItem as ToolData;

        public UrCharacterAnimator Animator => animator;
        public Transform Graphics => characterGraphicsGo.transform;
        public InteractionSensor InteractionSensor => interactionSensor;
        public TileHighlighter TileHighlighter => tileHighlighter;
        public Transform ToolInteractionAnchor => toolInteractionAnchor;
        public Transform CharacterCenter => characterCenter;
        public CharacterPerformPrimaryActionAbility PerformPrimaryAction => performPrimaryActionAbility;
        public ActionRegistry ActionRegistry => actionRegistry;
        public ToolActionRegistry ToolActionRegistry => toolActionRegistry;
        public AbstractInteractable CurrentInteractable => interactionSensor.Current;

        public MovementState MovementState { get; private set; } = MovementState.Invalid;
        public ConditionState ConditionState { get; private set; } = ConditionState.Normal;
        public event Action<MovementState> OnMovementStateChanged;
        public event Action<ConditionState> OnConditionStateChanged;
        public bool IsControlBlocked => IsConditionOrControlBlocked || Occupation.IsOccupied;
        public bool IsConditionOrControlBlocked => ConditionState != ConditionState.Normal || _controlBlocks.Count > 0 || UI.Shared.UrGUIManager.IsCharacterPaused(this);
        public bool IsRuntimeInitialized { get; private set; }
        private bool _locationEntered;
        private readonly HashSet<object> _controlBlocks = new();
        private CharacterAbility[] _abilities;
        private CharacterEquipmentEffects _equipmentEffects;

        protected virtual void Awake()
        {
            ValidateConfiguration();
            Controller = GetComponent<Controller2D>();
            Orientation = GetComponent<Orientation2D>();
            Tiles = GetComponent<CharacterTileContext>();
            Tiles.Bind(this);
            _abilities = abilitiesGo.GetComponentsInChildren<CharacterAbility>(true);
            Wallet = new Wallet(this);
            Health = GetComponent<CharacterHealth>();
            Health.Bind(this);
            Boosts = GetComponent<CharacterBoosts>();
            Boosts.Bind(this);
            Stamina.Bind(this);
            Skills.BindCharacter(this);
            characterGraphicsGo.SetActive(false);
        }

        // Registration may immediately enter a location. All child Awake methods must have completed first.
        protected virtual void Start() => LevelManager.Instance.RegisterLifecycle(this);

        public virtual void ValidateConfiguration()
        {
            if (!animator || !interactionSensor || !tileHighlighter || !toolInteractionAnchor || !characterCenter ||
                !actionRegistry || !toolActionRegistry || !characterGraphicsGo || !abilitiesGo || !MainInventory || !Stamina)
                throw new InvalidOperationException($"Character '{name}' requires all authored subsystem references.");
            if (!GetComponent<Controller2D>() || !GetComponent<Orientation2D>() || !GetComponent<CharacterOccupation>() || !GetComponent<CharacterTileContext>() || !GetComponent<CharacterHealth>())
                throw new InvalidOperationException($"Character '{name}' requires controller, orientation, occupation, tile and health components.");
            if (!MainInventory.Configuration)
                throw new InvalidOperationException($"Character '{name}' requires an inventory configuration.");
            if (attributes == null) throw new InvalidOperationException($"Character '{name}' requires attributes.");
            var boosts = GetComponent<CharacterBoosts>();
            if (!boosts) throw new InvalidOperationException($"Character '{name}' requires its boosts component.");
            if (Stamina.StartStamina < 0)
                throw new InvalidOperationException($"Character '{name}' requires nonnegative starting stamina.");
            attributes.ValidateConfiguration();
            actionRegistry.ValidateConfiguration();
            toolActionRegistry.ValidateConfiguration();
        }

        protected virtual void OnDestroy()
        {
            // Teardown removes bonuses; it must not clamp the live saved resources against a temporary lower maximum.
            if (Health) Health.Unbind();
            if (Stamina) Stamina.Unbind();
            if (Boosts) Boosts.Unbind();
            // Initialization can fail before equipment is bound; teardown must still release completed bindings.
            if (_equipmentEffects != null) _equipmentEffects.Dispose();
            Skills.UnbindCharacter(this);
            if (LevelManager.Instance) LevelManager.Instance.UnregisterLifecycle(this);
        }

        public void EnsureRuntimeInitialized()
        {
            if (IsRuntimeInitialized) return;
            MainInventory.EnsureInitialized();
            toolActionRegistry.Initialize(this);
            actionRegistry.Initialize(this);
            _equipmentEffects = new CharacterEquipmentEffects(MainInventory, Attributes);
            InitializeCharacterState();
            IsRuntimeInitialized = true;
        }

        // The main character overrides this to bind the live save root. Other characters keep local state.
        protected virtual void InitializeCharacterState()
        {
            Boosts.Initialize(new CharacterBoostState());
            Health.Initialize(new HealthState());
            Stamina.Initialize(new StaminaState());
        }

        private void Update()
        {
            if (!_locationEntered) return;
            Tiles.Refresh();
            foreach (var ability in _abilities)
                if (ability.isActiveAndEnabled) ability.Tick();
        }

        private void LateUpdate()
        {
            if (!_locationEntered) return;
            foreach (var ability in _abilities)
                if (ability.isActiveAndEnabled) ability.TickLate();
        }

        public T GetAbility<T>() where T : CharacterAbility
        {
            foreach (var ability in _abilities)
                if (ability is T typed) return typed;
            throw new InvalidOperationException($"Character '{name}' has no {typeof(T).Name} in its configured abilities hierarchy.");
        }

        /// <summary>Each operation releases only its own block; blocks never rewrite character conditions.</summary>
        public void SetControlBlocked(object owner, bool blocked)
        {
            if (owner == null) throw new ArgumentNullException(nameof(owner));
            if (blocked)
            {
                if (_controlBlocks.Add(owner)) Controller.Stop();
            }
            else _controlBlocks.Remove(owner);
        }

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
            if (state != ConditionState.Normal) Controller.Stop();
            OnConditionStateChanged?.Invoke(state);
        }

        public void OnLocationEnter(LocationData location)
        {
            EnsureRuntimeInitialized();
            Tiles.EnterLocation(MapManager.Instance);
            characterGraphicsGo.SetActive(true);
            animator.OnLocationEnter(location);
            foreach (var ability in _abilities) ability.OnLocationEnter(location);
            _locationEntered = true;
            SetMovementState(MovementState.Idle);
        }

        public void OnLocationLeave(LocationData location)
        {
            _locationEntered = false;
            foreach (var ability in _abilities) ability.OnLocationLeave(location);
            animator.OnLocationLeave(location);
            Tiles.LeaveLocation();
            characterGraphicsGo.SetActive(false);
        }

        public void InitializeSkills(CharacterSkills skills)
        {
            if (skills == null) throw new ArgumentNullException(nameof(skills));
            if (ReferenceEquals(Skills, skills)) return;
            Skills.UnbindCharacter(this);
            Skills = skills;
            Skills.BindCharacter(this);
        }
    }
}
