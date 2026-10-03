using Character;
using Core.Events;
using Core.Game;
using Core.Inventory;
using Interaction.Tools;
using Interaction.Tools.Stamina;
using Items;
using UnityEngine;

namespace Core
{
    /// <summary>
    /// Initializes player state and the starting loadout across scene loads.
    /// Lives on SystemRoot. Add starting tools/items here instead of on GameCharacter.
    /// </summary>
    public class PlayerStateManager : Singleton<PlayerStateManager>,
        IEventListener<StaminaChangedEvent>
    {
        [SerializeField] int _startingStamina = 100;
        [SerializeField] ToolData[] _startingTools;
        [SerializeField] ItemDefinition[] _startingItems;

        bool _inventoryInitialized;

        void OnEnable()  => this.Subscribe<StaminaChangedEvent>();
        void OnDisable() => this.Unsubscribe<StaminaChangedEvent>();

        public void OnEvent(StaminaChangedEvent e)
        {
            if (e.Character is not MainCharacter) return;
            GameState.Player.CurrentStamina = e.Current;
            GameState.Player.StaminaInitialized = true;
        }

        /// <summary>
        /// Called during GameCharacter runtime initialization on every spawn.
        /// Initializes the player loadout once and restores player stamina on each spawn.
        /// </summary>
        public void InitializeCharacter(GameCharacter character)
        {
            if (character is not MainCharacter)
            {
                character.InitializeStamina(_startingStamina);
                return;
            }

            var player = GameState.Player;
            if (!player.StaminaInitialized)
            {
                player.CurrentStamina = _startingStamina;
                player.StaminaInitialized = true;
            }

            character.InitializeSkills(player.Skills);
            GameStateManager.Instance.DivineFavour.BindCharacter(character);

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

            character.InitializeStamina(player.CurrentStamina);
        }
    }
}
