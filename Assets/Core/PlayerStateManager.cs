using Character;
using System;
using System.Linq;
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
            character.Wallet.Bind(player.Wallet);
            GameStateManager.Instance.DivineFavour.BindCharacter(character);

            var inventory = SlotInventory.FindInventory("MainInventory", "Player1");
            if (inventory == null)
            {
                Debug.LogWarning("[PlayerStateManager] MainInventory not found yet. Inventory binding will retry on the next character initialization.");
            }
            else
            {
                inventory.Bind(player.Inventory);
                var loadout = (_startingTools ?? Array.Empty<ToolData>()).Cast<ItemDefinition>()
                    .Concat(_startingItems ?? Array.Empty<ItemDefinition>());
                if (!inventory.ApplyStartingLoadout(loadout))
                    Debug.LogError("[PlayerStateManager] Starting loadout contains invalid items or does not fit. Nothing was added.");
            }

            character.InitializeStamina(player.CurrentStamina);
        }
    }
}
