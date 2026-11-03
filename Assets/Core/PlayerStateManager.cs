using Character;
using System;
using System.Linq;
using Core.Game;
using Core.Divinity;
using Core.Inventory;
using Core.Location;
using Interaction.Tools;
using Items;
using UnityEngine;

namespace Core
{
    /// <summary>
    /// Initializes player state and the starting loadout across scene loads.
    /// Uses the root's authored player settings, independently of Unity callbacks.
    /// </summary>
    public sealed class PlayerStateManager
    {
        private readonly GameState _gameState;
        private readonly DivineFavour _favour;
        private readonly PlayerSettings _settings;

        public PlayerStateManager(GameState state, DivineFavour favour, PlayerSettings settings)
        {
            settings.Validate();
            _gameState = state;
            _favour = favour;
            _settings = settings;
        }

        public LocationData StartingHomeLocation => _settings.startingHomeLocation;
        public string StartingBedId => _settings.startingBedId;

        /// <summary>
        /// Called during GameCharacter runtime initialization on every spawn.
        /// Initializes the player loadout once and restores player health and stamina on each spawn.
        /// </summary>
        public void InitializeCharacter(MainCharacter character)
        {
            var player = _gameState.Player;
            InitializeHome();
            // Attribute sources are rebound before resource state, without clipping saved points at an intermediate maximum.
            character.Health.Unbind();
            character.Stamina.Unbind();
            character.InitializeSkills(player.Skills);
            character.Wallet.Bind(player.Wallet);
            _favour.BindCharacter(character);

            var inventory = character.MainInventory;
            inventory.Bind(player.Inventory);
            var loadout = _settings.startingTools.Cast<ItemDefinition>().Concat(_settings.startingItems);
            if (!inventory.ApplyStartingLoadout(loadout))
                throw new InvalidOperationException("The configured starting loadout does not fit the player's inventory.");

            character.Boosts.Initialize(player.Boosts);
            character.Health.Initialize(player.Health);
            character.Stamina.Initialize(player.Stamina);
        }

        /// <summary>Seeds a new player's home once. Loaded and subsequently reassigned homes remain authoritative.</summary>
        public void InitializeHome()
        {
            if (_gameState.Player.Home != null) return;
            _gameState.Player.Home = new PlayerHomeState(StartingHomeLocation.id, StartingBedId);
        }

    }
}
