using System;
using Core.Game;

namespace Core.Divinity
{
    public static class DivineFavour
    {
        private static DivineFavourManager Manager => GameStateManager.Instance
            ? GameStateManager.Instance.DivineFavour
            : throw new InvalidOperationException("Divine favour is unavailable until SystemRoot has initialized.");

        public static int GetFavour(string deityId) => Manager.GetFavour(deityId);
        public static int GetFavour(DeityDefinition deity) => Manager.GetFavour(deity.Id);
        public static int AddFavour(string deityId, int points) => Manager.AddFavour(deityId, points);
        public static int AddFavour(DeityDefinition deity, int points) => Manager.AddFavour(deity, points);
    }
}
