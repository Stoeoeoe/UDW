using Core.Game;
using System;
using Character;

namespace Core.Divinity
{
    public sealed class DivineFavour : IDisposable
    {
        private readonly GameState _state;
        private readonly DeityDefinitions _definitions;
        private DivineFavourManager _manager;

        public DivineFavour(GameState state, DeityDefinitions definitions)
        {
            _state = state;
            _definitions = definitions;
            _manager = new DivineFavourManager(state.Player.Favour, definitions);
            _state.Restored += OnRestored;
        }

        private void OnRestored()
        {
            _manager.Dispose();
            _manager = new DivineFavourManager(_state.Player.Favour, _definitions);
        }

        public void BindCharacter(GameCharacter character) => _manager.BindCharacter(character);

        public int GetFavour(string deityId) => _manager.GetFavour(deityId);
        public int GetFavour(DeityDefinition deity) => _manager.GetFavour(deity.Id);
        public int AddFavour(string deityId, int points) => _manager.AddFavour(deityId, points);

        public void Dispose()
        {
            _state.Restored -= OnRestored;
            _manager.Dispose();
        }
    }
}
