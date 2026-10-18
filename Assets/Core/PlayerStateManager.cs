using Character;
using System;
using System.Linq;
using Core.Game;
using Core.Inventory;
using Core.Location;
using Interaction.Tools;
using Items;
using UnityEngine;

namespace Core
{
    /// <summary>
    /// Initializes player state and the starting loadout across scene loads.
    /// Lives on SystemRoot. Add starting tools/items here instead of on GameCharacter.
    /// </summary>
    public class PlayerStateManager : Singleton<PlayerStateManager>
    {
        [SerializeField] ToolData[] _startingTools = Array.Empty<ToolData>();
        [SerializeField] ItemDefinition[] _startingItems = Array.Empty<ItemDefinition>();
        [Header("Starting home")]
        [SerializeField] private LocationData _startingHomeLocation;
        [SerializeField] private string _startingBedId;

        public LocationData StartingHomeLocation => _startingHomeLocation;
        public string StartingBedId => _startingBedId;

        /// <summary>
        /// Called during GameCharacter runtime initialization on every spawn.
        /// Initializes the player loadout once and restores player health and stamina on each spawn.
        /// </summary>
        public void InitializeCharacter(MainCharacter character)
        {
            var player = GameState.Player;
            InitializeHome();
            // Attribute sources are rebound before resource state, without clipping saved points at an intermediate maximum.
            character.Health.Unbind();
            character.Stamina.Unbind();
            character.InitializeSkills(player.Skills);
            character.Wallet.Bind(player.Wallet);
            GameStateManager.Instance.DivineFavour.BindCharacter(character);

            var inventory = character.MainInventory;
            inventory.Bind(player.Inventory);
            var loadout = _startingTools.Cast<ItemDefinition>().Concat(_startingItems);
            if (!inventory.ApplyStartingLoadout(loadout))
                throw new InvalidOperationException("The configured starting loadout does not fit the player's inventory.");

            character.Boosts.Initialize(player.Boosts);
            character.Health.Initialize(player.Health);
            character.Stamina.Initialize(player.Stamina);
        }

        /// <summary>Seeds a new player's home once. Loaded and subsequently reassigned homes remain authoritative.</summary>
        public void InitializeHome()
        {
            if (GameState.Player.Home != null) return;
            if (!_startingHomeLocation)
                throw new InvalidOperationException("PlayerStateManager requires a configured starting home location.");
            GameState.Player.Home = new PlayerHomeState(_startingHomeLocation.id, _startingBedId);
        }

    }
}
