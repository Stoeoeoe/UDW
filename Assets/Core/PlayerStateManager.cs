using Character;
using Core.Events;
using Core.Inventory;
using Interaction.Tools;
using Interaction.Tools.Stamina;
using Items;
using UnityEngine;

namespace Core
{
    /// <summary>
    /// Persists player state (stamina, one-time inventory init) across scene loads.
    /// Lives on SystemRoot. Add starting tools/items here instead of on GameCharacter.
    /// </summary>
    public class PlayerStateManager : Singleton<PlayerStateManager>,
        IEventListener<StaminaChangedEvent>
    {
        [SerializeField] int _startingStamina = 100;
        [SerializeField] ToolData[] _startingTools;
        [SerializeField] ItemDefinition[] _startingItems;

        int _currentStamina;
        bool _inventoryInitialized;
        readonly CharacterSkills _skills = new CharacterSkills();

        protected override void OnAwake()
        {
            base.OnAwake();
            _currentStamina = _startingStamina;
        }

        void OnEnable()  => this.Subscribe<StaminaChangedEvent>();
        void OnDisable() => this.Unsubscribe<StaminaChangedEvent>();

        public void OnEvent(StaminaChangedEvent e) => _currentStamina = e.Current;

        /// <summary>
        /// Called by GameCharacter.Start() on every spawn.
        /// Initializes inventory once, restores stamina every time.
        /// </summary>
        public void InitializeCharacter(GameCharacter character)
        {
            if (character is MainCharacter)
                character.InitializeSkills(_skills);

            if (!_inventoryInitialized)
            {
                var inventory = SlotInventory.FindInventory("MainInventory", "Player1");
                if (inventory == null)
                {
                    Debug.LogWarning("[PlayerStateManager] MainInventory not found yet. Starting loadout initialization will retry on the next character initialization.");
                }
                else
                {
                    foreach (var tool in _startingTools)  inventory.AddItem(tool, 1);
                    foreach (var item in _startingItems)  inventory.AddItem(item, 1);
                    _inventoryInitialized = true;
                }
            }

            character.InitializeStamina(_currentStamina);
        }
    }
}
