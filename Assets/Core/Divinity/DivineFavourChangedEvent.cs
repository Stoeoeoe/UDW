using Core.Events;

namespace Core.Divinity
{
    public struct DivineFavourChangedEvent
    {
        public DivineFavourState State;
        public string DeityId;
        public int PreviousFavour;
        public int NewFavour;

        internal static void Trigger(DivineFavourState state, string deityId, int previous, int current)
            => EventBus<DivineFavourChangedEvent>.Raise(new DivineFavourChangedEvent
            {
                State = state,
                DeityId = deityId,
                PreviousFavour = previous,
                NewFavour = current
            });
    }
}
