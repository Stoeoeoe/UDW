using Core.Game;

namespace Core.Divinity
{
    public static class DivineFavour
    {
        private static DivineFavourManager Manager => GameStateManager.Instance.DivineFavour;

        public static int GetFavour(string deityId) => Manager.GetFavour(deityId);
        public static int GetFavour(DeityDefinition deity) => Manager.GetFavour(deity.Id);
        public static int AddFavour(string deityId, int points) => Manager.AddFavour(deityId, points);
    }
}
