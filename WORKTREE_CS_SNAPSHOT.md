# Changed C# files in the worktree

Snapshot of the current file contents, including modified and untracked C# files. This document is not updated automatically.

| Status | File |
| --- | --- |
| modified | `Assets/Character/GameCharacter.cs` |
| modified | `Assets/Character/SkillDefinition.cs` |
| modified | `Assets/Core/Items/EquippableItem.cs` |
| new | `Assets/Character/CharacterSkillTagGrants.cs` |
| new | `Assets/Core/GameplayTags/GameplayTag.cs` |
| new | `Assets/Core/GameplayTags/GameplayTagPickerAttribute.cs` |
| new | `Assets/Core/GameplayTags/TagQuery.cs` |
| new | `Assets/Core/GameplayTags/TagSet.cs` |
| new | `Assets/Editor/GameplayTagTests.cs` |
| new | `Assets/Editor/GameplayTags/GameplayTagCatalog.cs` |
| new | `Assets/Editor/GameplayTags/GameplayTagCatalogWindow.cs` |
| new | `Assets/Editor/GameplayTags/GameplayTagPickerDrawer.cs` |

## Assets/Character/GameCharacter.cs

Status: modified

````csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Character.Abilities;
using Core;
using Core.Inventory;
using Core.GameplayTags;
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
    /// Owns state, components, and game-specific data. Drives nothing itself â€” abilities do that.
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

        // â”€â”€ Serialized refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

        // â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        public MovementState MovementState { get; private set; } = MovementState.Invalid;
        public ConditionState ConditionState { get; private set; } = ConditionState.Normal;

        public event Action<MovementState> OnMovementStateChanged;
        public event Action<ConditionState> OnConditionStateChanged;

        public bool IsFrozen => ConditionState == ConditionState.Frozen;
        public bool IsRuntimeInitialized { get; private set; }
        public LifecycleState CurrentLifecycleState { get; private set; } = LifecycleState.Booting;

        // â”€â”€ Game data accessors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        private readonly TagSet _tags = new TagSet();
        private CharacterSkillTagGrants _skillTagGrants;

        /// <summary>Runtime tags derived from skill levels and other active grants.</summary>
        public TagSet Tags => _tags;

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

        // â”€â”€ Lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        protected virtual void Awake()
        {
            _skillTagGrants = new CharacterSkillTagGrants(_tags);
            _skillTagGrants.Bind(Skills);
            Controller = GetComponent<Controller2D>();
            Orientation = GetComponent<Orientation2D>();

            Abilities = abilitiesGo.GetComponents<CharacterAbility>().ToList();
            characterGraphicsGo.SetActive(false);

            LevelManager.Instance?.RegisterLifecycle(this);
        }

        // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        private bool _sceneReady;

        protected virtual void Start()
        {
            // Initialization now happens in OnLocationEnter, called by LevelManager
        }

        private void OnDestroy()
        {
            _skillTagGrants?.Dispose();
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

        // â”€â”€ State API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

        // â”€â”€ Abilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        protected List<CharacterAbility> Abilities = new();

        /// <summary>Finds the first ability of type T on this character. Cached by abilities themselves on Awake.</summary>
        public T GetAbility<T>() where T : CharacterAbility
        {
            foreach (var a in Abilities)
                if (a is T typed)
                    return typed;
            return GetComponentInChildren<T>();
        }

        // â”€â”€ Item helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

        // â”€â”€ Energy API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        public void ConsumeStamina(int amount) => Stamina?.ConsumeStamina(amount);
        public void InitializeStamina(int value) => Stamina?.Initialize(value);

        // â”€â”€ Tile tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
            _skillTagGrants.Bind(Skills);
        }
    }
}
````

## Assets/Character/SkillDefinition.cs

Status: modified

````csharp
using System;
using Core.GameplayTags;
using UnityEngine;

namespace Character
{
    /// <summary>Player-facing skill details and its value at each level, starting with level zero.</summary>
    [CreateAssetMenu(fileName = "Skill Definition", menuName = "Game/Skills/Definition")]
    public sealed class SkillDefinition : ScriptableObject
    {
        [Tooltip("Stable namespaced ID, for example base:hammer_mastery. Do not change after saving games with this skill.")]
        [SerializeField] private string skillId;
        [SerializeField] private string displayName;
        [TextArea(2, 4)] [SerializeField] private string description;
        [SerializeField] private Sprite icon;
        [Tooltip("Include level zero (before the skill is upgraded) as the first entry.")]
        [SerializeField] private SkillLevelDefinition[] levels = { new SkillLevelDefinition() };

        public string SkillId => skillId;
        public string DisplayName => displayName;
        public string Description => description;
        public Sprite Icon => icon;
        public int MaxLevel => levels == null ? 0 : Mathf.Max(0, levels.Length - 1);

        public SkillLevelDefinition GetLevelDefinition(int level)
        {
            if (levels == null || levels.Length == 0)
                return null;

            return levels[Mathf.Clamp(level, 0, levels.Length - 1)];
        }

        public float GetValueAtLevel(int level)
        {
            return GetLevelDefinition(level)?.Value ?? 0f;
        }
    }

    [Serializable]
    public sealed class SkillLevelDefinition
    {
        [SerializeField] private float value;
        [SerializeField] private string title;
        [TextArea(2, 4)] [SerializeField] private string description;
        [Tooltip("Tags granted at this level and retained at higher levels.")]
        [GameplayTagPicker]
        [SerializeField] private string[] grantedTags = Array.Empty<string>();

        public float Value => value;
        public string Title => title;
        public string Description => description;
        public string[] GrantedTags => grantedTags;
    }
}
````

## Assets/Core/Items/EquippableItem.cs

Status: modified

````csharp
using Core.Inventory;

namespace Items
{
    /// <summary>
    /// Base class for all equippable items.
    /// Equipping is handled by GameCharacter.SetHeldItem(), not by this class.
    /// </summary>
    public abstract class EquippableItem : ItemDefinition { }
}
````

## Assets/Character/CharacterSkillTagGrants.cs

Status: new

````csharp
using System;
using System.Collections.Generic;
using Core.Events;
using Core.GameplayTags;

namespace Character
{
    /// <summary>Keeps a character's skill-granted tags in sync with its current skills.</summary>
    internal sealed class CharacterSkillTagGrants : IEventListener<SkillLevelChangedEvent>, IDisposable
    {
        private readonly TagSet _tags;
        private readonly HashSet<string> _sources = new(StringComparer.Ordinal);
        private CharacterSkills _skills;

        internal CharacterSkillTagGrants(TagSet tags)
        {
            _tags = tags ?? throw new ArgumentNullException(nameof(tags));
            this.Subscribe<SkillLevelChangedEvent>();
        }

        internal void Bind(CharacterSkills skills)
        {
            if (skills == null) throw new ArgumentNullException(nameof(skills));

            ClearGrants();
            _skills = skills;
            foreach (var pair in skills.GetLevels())
                Update(pair.Key, pair.Value);
        }

        public void OnEvent(SkillLevelChangedEvent e)
        {
            if (ReferenceEquals(e.Skills, _skills))
                Update(e.SkillId, e.NewLevel);
        }

        public void Dispose()
        {
            this.Unsubscribe<SkillLevelChangedEvent>();
            ClearGrants();
            _skills = null;
        }

        private void ClearGrants()
        {
            foreach (var source in _sources)
                _tags.RemoveSource(source);
            _sources.Clear();
        }

        private void Update(string skillId, int level)
        {
            // TagSet shares one source namespace across skills, boons, equipment, etc.
            var source = "skill:" + skillId;
            if (level <= 0)
            {
                _tags.RemoveSource(source);
                _sources.Remove(source);
                return;
            }

            var definition = SkillDefinitions.Get(skillId);
            var grantedTags = new List<string>();
            for (var currentLevel = 1; currentLevel <= level; currentLevel++)
            {
                var levelTags = definition.GetLevelDefinition(currentLevel)?.GrantedTags;
                if (levelTags != null) grantedTags.AddRange(levelTags);
            }

            _tags.SetSourceTags(source, grantedTags);
            if (grantedTags.Count > 0) _sources.Add(source);
            else _sources.Remove(source);
        }
    }
}
````

## Assets/Core/GameplayTags/GameplayTag.cs

Status: new

````csharp
using System;

namespace Core.GameplayTags
{
    /// <summary>Validation and hierarchical matching for dotted gameplay tags.</summary>
    public static class GameplayTag
    {
        public static void Validate(string tag)
        {
            if (string.IsNullOrWhiteSpace(tag))
                throw new ArgumentException("A gameplay tag is required.", nameof(tag));

            if (tag[0] == '.' || tag[tag.Length - 1] == '.' || tag.Contains(".."))
                throw new ArgumentException($"Gameplay tag '{tag}' has an empty path segment.", nameof(tag));

            foreach (var character in tag)
                if (!char.IsLetterOrDigit(character) && character != '_' && character != '-' && character != '.')
                    throw new ArgumentException($"Gameplay tag '{tag}' contains an invalid character.", nameof(tag));
        }

        public static bool Matches(string ownedTag, string queryTag, bool exact = false)
        {
            Validate(queryTag);
            return string.Equals(ownedTag, queryTag, StringComparison.Ordinal) ||
                   !exact && ownedTag.StartsWith(queryTag + ".", StringComparison.Ordinal);
        }
    }
}
````

## Assets/Core/GameplayTags/GameplayTagPickerAttribute.cs

Status: new

````csharp
using UnityEngine;

namespace Core.GameplayTags
{
    /// <summary>Shows a catalog-backed picker for a serialized gameplay-tag string.</summary>
    public sealed class GameplayTagPickerAttribute : PropertyAttribute { }
}
````

## Assets/Core/GameplayTags/TagQuery.cs

Status: new

````csharp
using System;
using System.Collections.Generic;

namespace Core.GameplayTags
{
    /// <summary>Compiled all/any/none query. Leaves match descendants; exact(tag) does not.</summary>
    public sealed class TagQuery
    {
        private readonly string _tag;
        private readonly bool _exact;
        private readonly string _operation;
        private readonly TagQuery[] _children;

        private TagQuery(string tag, bool exact, string operation, TagQuery[] children)
        {
            _tag = tag;
            _exact = exact;
            _operation = operation;
            _children = children;
        }

        public bool Matches(TagSet tags)
        {
            if (tags == null) throw new ArgumentNullException(nameof(tags));
            if (_tag != null) return tags.Has(_tag, _exact);

            switch (_operation)
            {
                case "all":
                    foreach (var child in _children)
                        if (!child.Matches(tags)) return false;
                    return true;
                case "any":
                    foreach (var child in _children)
                        if (child.Matches(tags)) return true;
                    return false;
                case "none":
                    foreach (var child in _children)
                        if (child.Matches(tags)) return false;
                    return true;
                default:
                    throw new InvalidOperationException($"Unknown tag query operation '{_operation}'.");
            }
        }

        /// <summary>Parses expressions such as all(State.Blessed, none(exact(State.Cursed))).</summary>
        public static TagQuery Parse(string expression)
        {
            if (expression == null) throw new ArgumentNullException(nameof(expression));
            var parser = new Parser(expression);
            var result = parser.ReadQuery();
            parser.SkipWhitespace();
            if (!parser.AtEnd) throw new FormatException("Unexpected text after gameplay tag query.");
            return result;
        }

        private sealed class Parser
        {
            private readonly string _text;
            private int _position;

            public Parser(string text) => _text = text;
            public bool AtEnd => _position == _text.Length;

            public void SkipWhitespace()
            {
                while (!AtEnd && char.IsWhiteSpace(_text[_position])) _position++;
            }

            public TagQuery ReadQuery()
            {
                SkipWhitespace();
                var token = ReadToken();
                SkipWhitespace();
                if (AtEnd || _text[_position] != '(')
                {
                    GameplayTag.Validate(token);
                    return new TagQuery(token, false, null, null);
                }

                _position++;
                if (token == "exact")
                {
                    SkipWhitespace();
                    var tag = ReadToken();
                    GameplayTag.Validate(tag);
                    SkipWhitespace();
                    Expect(')');
                    return new TagQuery(tag, true, null, null);
                }

                if (token != "all" && token != "any" && token != "none")
                    throw new FormatException($"Unknown gameplay tag query operation '{token}'.");

                var children = new List<TagQuery>();
                SkipWhitespace();
                if (!AtEnd && _text[_position] == ')')
                    throw new FormatException($"Gameplay tag query '{token}' needs at least one argument.");

                while (true)
                {
                    children.Add(ReadQuery());
                    SkipWhitespace();
                    if (!AtEnd && _text[_position] == ')')
                    {
                        _position++;
                        break;
                    }
                    Expect(',');
                }

                return new TagQuery(null, false, token, children.ToArray());
            }

            private string ReadToken()
            {
                SkipWhitespace();
                var start = _position;
                while (!AtEnd && !char.IsWhiteSpace(_text[_position]) &&
                       _text[_position] != '(' && _text[_position] != ')' && _text[_position] != ',')
                    _position++;
                if (start == _position) throw new FormatException("Expected a gameplay tag or query operation.");
                return _text.Substring(start, _position - start);
            }

            private void Expect(char character)
            {
                SkipWhitespace();
                if (AtEnd || _text[_position] != character)
                    throw new FormatException($"Expected '{character}' in gameplay tag query.");
                _position++;
            }
        }
    }
}
````

## Assets/Core/GameplayTags/TagSet.cs

Status: new

````csharp
using System;
using System.Collections.Generic;

namespace Core.GameplayTags
{
    /// <summary>Runtime-only tags granted by replaceable sources such as skills and boons.</summary>
    public sealed class TagSet
    {
        private readonly Dictionary<string, HashSet<string>> _sources = new(StringComparer.Ordinal);
        private readonly Dictionary<string, int> _counts = new(StringComparer.Ordinal);

        public bool Has(string tag, bool exact = false)
        {
            GameplayTag.Validate(tag);
            if (exact) return _counts.ContainsKey(tag);

            foreach (var ownedTag in _counts.Keys)
                if (GameplayTag.Matches(ownedTag, tag))
                    return true;
            return false;
        }

        public void SetSourceTags(string sourceId, IEnumerable<string> tags)
        {
            if (string.IsNullOrWhiteSpace(sourceId))
                throw new ArgumentException("A tag source ID is required.", nameof(sourceId));
            if (tags == null) throw new ArgumentNullException(nameof(tags));

            var replacement = new HashSet<string>(StringComparer.Ordinal);
            foreach (var tag in tags)
            {
                GameplayTag.Validate(tag);
                replacement.Add(tag);
            }

            RemoveSource(sourceId);
            if (replacement.Count == 0) return;

            _sources.Add(sourceId, replacement);
            foreach (var tag in replacement)
                _counts[tag] = _counts.TryGetValue(tag, out var count) ? count + 1 : 1;
        }

        public bool RemoveSource(string sourceId)
        {
            if (!_sources.Remove(sourceId, out var tags)) return false;
            foreach (var tag in tags)
            {
                if (_counts[tag] == 1) _counts.Remove(tag);
                else _counts[tag]--;
            }
            return true;
        }
    }
}
````

## Assets/Editor/GameplayTagTests.cs

Status: new

````csharp
using System;
using Core.GameplayTags;
using Core.GameplayTags.Editor;
using NUnit.Framework;
using UnityEngine;

public sealed class GameplayTagTests
{
    [Test]
    public void SourcesCanOverlapAndBeReplacedIndependently()
    {
        var tags = new TagSet();
        tags.SetSourceTags("skill:one", new[] { "State.Blessed" });
        tags.SetSourceTags("boon:mercury", new[] { "State.Blessed", "State.Inspired.Mercury" });

        tags.SetSourceTags("skill:one", Array.Empty<string>());
        Assert.That(tags.Has("State.Blessed"), Is.True);
        Assert.That(tags.Has("State.Inspired"), Is.True);
        Assert.That(tags.Has("State.Inspired", exact: true), Is.False);

        tags.RemoveSource("boon:mercury");
        Assert.That(tags.Has("State.Blessed"), Is.False);
    }

    [Test]
    public void QueryCombinesHierarchyExactAnyAllAndNone()
    {
        var tags = new TagSet();
        tags.SetSourceTags("boon", new[] { "State.Blessed.Mercury" });

        var query = TagQuery.Parse("all(State.Blessed, any(State.Blessed.Mercury, State.Inspired), none(State.Cursed), none(exact(State.Blessed)))");
        Assert.That(query.Matches(tags), Is.True);
        Assert.That(TagQuery.Parse("State.Bless").Matches(tags), Is.False);
        Assert.That(TagQuery.Parse("exact(State.Blessed)").Matches(tags), Is.False);
    }

    [Test]
    public void InvalidTagOrQueryIsRejected()
    {
        var tags = new TagSet();
        Assert.Throws<ArgumentException>(() => tags.SetSourceTags("source", new[] { "State..Blessed" }));
        Assert.Throws<ArgumentException>(() => tags.SetSourceTags("source", new[] { "base:State.Blessed" }));
        Assert.Throws<FormatException>(() => TagQuery.Parse("all(State.Blessed, )"));
    }

    [Test]
    public void RemovingAnImplicitRootDeletesOnlyItsBranch()
    {
        var catalog = ScriptableObject.CreateInstance<GameplayTagCatalog>();
        try
        {
            catalog.Add("Weapon.Spear");
            catalog.Add("Weapon.Spear.Long");
            catalog.Add("Weapon.Sword");
            catalog.Add("Weaponry.Staff");

            Assert.That(catalog.Contains("Weapon"), Is.False);
            Assert.That(catalog.CountBranch("Weapon"), Is.EqualTo(3));
            Assert.That(catalog.RemoveBranch("Weapon"), Is.EqualTo(3));
            Assert.That(catalog.Tags, Is.EquivalentTo(new[] { "Weaponry.Staff" }));
        }
        finally
        {
            UnityEngine.Object.DestroyImmediate(catalog);
        }
    }
}
````

## Assets/Editor/GameplayTags/GameplayTagCatalog.cs

Status: new

````csharp
using System;
using System.Collections.Generic;
using Core.GameplayTags;
using UnityEditor;
using UnityEngine;

namespace Core.GameplayTags.Editor
{
    // Authoring data only. Gameplay still stores and queries plain strings.
    public sealed class GameplayTagCatalog : ScriptableObject
    {
        internal const string AssetPath = "Assets/Editor/GameplayTags/GameplayTagCatalog.asset";

        [SerializeField] private List<string> tags = new();

        internal IReadOnlyList<string> Tags => tags;

        internal bool Contains(string tag) => tags.Contains(tag);

        internal bool Add(string tag)
        {
            GameplayTag.Validate(tag);
            if (Contains(tag)) return false;
            Undo.RecordObject(this, "Add Gameplay Tag");
            tags.Add(tag);
            tags.Sort(StringComparer.Ordinal);
            EditorUtility.SetDirty(this);
            AssetDatabase.SaveAssets();
            return true;
        }

        internal int CountBranch(string path)
        {
            var count = 0;
            foreach (var tag in tags)
                if (IsInBranch(tag, path)) count++;
            return count;
        }

        internal int RemoveBranch(string path)
        {
            var count = CountBranch(path);
            if (count == 0) return 0;

            Undo.RecordObject(this, "Remove Gameplay Tags");
            tags.RemoveAll(tag => IsInBranch(tag, path));
            EditorUtility.SetDirty(this);
            AssetDatabase.SaveAssets();
            return count;
        }

        private static bool IsInBranch(string tag, string path) =>
            string.Equals(tag, path, StringComparison.Ordinal) ||
            tag.StartsWith(path + ".", StringComparison.Ordinal);

        internal static GameplayTagCatalog Load()
        {
            return AssetDatabase.LoadAssetAtPath<GameplayTagCatalog>(AssetPath);
        }
    }
}
````

## Assets/Editor/GameplayTags/GameplayTagCatalogWindow.cs

Status: new

````csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Sirenix.OdinInspector;
using Sirenix.OdinInspector.Editor;
using UnityEditor;
using UnityEngine;

namespace Core.GameplayTags.Editor
{
    internal sealed class GameplayTagCatalogWindow : OdinMenuEditorWindow
    {
        private string _newTag = string.Empty;

        [MenuItem("Tools/Gameplay Tags")]
        internal static void Open()
        {
            var window = GetWindow<GameplayTagCatalogWindow>();
            window.titleContent = new GUIContent("Gameplay Tags");
            window.Show();
        }

        protected override OdinMenuTree BuildMenuTree()
        {
            var tree = new OdinMenuTree();
            tree.Selection.SupportsMultiSelect = false;

            var catalog = GameplayTagCatalog.Load();
            if (catalog != null)
            {
                var paths = new HashSet<string>(StringComparer.Ordinal);
                foreach (var tag in catalog.Tags)
                {
                    paths.Add(tag);
                    for (var dot = tag.IndexOf('.'); dot >= 0; dot = tag.IndexOf('.', dot + 1))
                        paths.Add(tag.Substring(0, dot));
                }

                foreach (var path in paths.OrderBy(value => value.Count(character => character == '.'))
                             .ThenBy(value => value, StringComparer.Ordinal))
                    tree.Add(path.Replace('.', '/'), new TagEntry(this, path));
            }

            return tree;
        }

        protected override void OnImGUI()
        {
            using (new EditorGUILayout.HorizontalScope(EditorStyles.toolbar))
            {
                GUILayout.Label("Tag path (e.g. Weapon.Sword)", GUILayout.Width(175f));
                var fieldWidth = Mathf.Clamp(position.width - 260f, 120f, 320f);
                _newTag = GUILayout.TextField(_newTag, EditorStyles.toolbarTextField, GUILayout.Width(fieldWidth));
                if (GUILayout.Button("Add Tag", EditorStyles.toolbarButton, GUILayout.Width(70f)))
                    AddTag(_newTag);
            }

            base.OnImGUI();
        }

        private void AddTag(string tag)
        {
            var catalog = GameplayTagCatalog.Load();
            if (catalog == null)
            {
                EditorUtility.DisplayDialog("Gameplay Tags", "The gameplay tag catalog asset is missing.", "OK");
                return;
            }

            try
            {
                if (!catalog.Add(tag))
                    EditorUtility.DisplayDialog("Gameplay Tags", $"'{tag}' already exists.", "OK");
                else
                {
                    _newTag = string.Empty;
                    ForceMenuTreeRebuild();
                }
            }
            catch (ArgumentException error)
            {
                EditorUtility.DisplayDialog("Invalid gameplay tag", error.Message, "OK");
            }
        }

        private sealed class TagEntry
        {
            private readonly GameplayTagCatalogWindow _window;
            private readonly string _tag;

            public TagEntry(GameplayTagCatalogWindow window, string tag)
            {
                _window = window;
                _tag = tag;
            }

            [OnInspectorGUI]
            private void Draw()
            {
                var catalog = GameplayTagCatalog.Load();
                if (catalog == null) return;

                EditorGUILayout.LabelField(_tag, EditorStyles.boldLabel);
                EditorGUILayout.LabelField(catalog.Contains(_tag) ? "Registered tag" : "Group", _tag);

                var count = catalog.CountBranch(_tag);
                var button = count == 1 ? "Delete Tag" : $"Delete Branch ({count} tags)";
                if (GUILayout.Button(button) &&
                    EditorUtility.DisplayDialog("Delete gameplay tags?",
                        $"Delete '{_tag}' and its {count} registered tag{(count == 1 ? "" : "s")}? Existing fields will keep their string values.",
                        "Delete", "Cancel"))
                {
                    catalog.RemoveBranch(_tag);
                    _window.ForceMenuTreeRebuild();
                }
            }
        }
    }
}
````

## Assets/Editor/GameplayTags/GameplayTagPickerDrawer.cs

Status: new

````csharp
using System;
using Core.GameplayTags;
using UnityEditor;
using UnityEngine;

namespace Core.GameplayTags.Editor
{
    [CustomPropertyDrawer(typeof(GameplayTagPickerAttribute))]
    internal sealed class GameplayTagPickerDrawer : PropertyDrawer
    {
        public override void OnGUI(Rect position, SerializedProperty property, GUIContent label)
        {
            if (property.propertyType != SerializedPropertyType.String)
            {
                EditorGUI.PropertyField(position, property, label);
                return;
            }

            EditorGUI.BeginProperty(position, label, property);
            var fieldRect = EditorGUI.PrefixLabel(position, label);
            var value = property.stringValue;
            var catalog = GameplayTagCatalog.Load();
            var known = string.IsNullOrEmpty(value) || catalog != null && catalog.Contains(value);
            var oldColor = GUI.color;
            if (!known) GUI.color = new Color(1f, 0.6f, 0.6f);
            if (EditorGUI.DropdownButton(fieldRect, new GUIContent(property.hasMultipleDifferentValues ? "â€”" : string.IsNullOrEmpty(value) ? "None" : value), FocusType.Keyboard))
                ShowMenu(fieldRect, property);
            GUI.color = oldColor;
            EditorGUI.EndProperty();
        }

        private static void ShowMenu(Rect rect, SerializedProperty property)
        {
            var menu = new GenericMenu();
            var targets = property.serializedObject.targetObjects;
            var path = property.propertyPath;
            var current = property.stringValue;
            menu.AddItem(new GUIContent("None"), string.IsNullOrEmpty(current), () => Assign(targets, path, string.Empty));

            var catalog = GameplayTagCatalog.Load();
            if (catalog != null)
                foreach (var tag in catalog.Tags)
                {
                    var selectedTag = tag;
                    menu.AddItem(new GUIContent("Tags/" + tag.Replace('.', '/') + "/Select"),
                        string.Equals(current, tag, StringComparison.Ordinal),
                        () => Assign(targets, path, selectedTag));
                }

            menu.AddSeparator("");
            menu.AddItem(new GUIContent("Manage Tags..."), false, GameplayTagCatalogWindow.Open);
            menu.DropDown(rect);
        }

        private static void Assign(UnityEngine.Object[] targets, string path, string tag)
        {
            foreach (var target in targets)
            {
                var serialized = new SerializedObject(target);
                var value = serialized.FindProperty(path);
                if (value == null) continue;
                value.stringValue = tag;
                serialized.ApplyModifiedProperties();
            }
        }
    }
}
````

