using Core.Events;

namespace Core.SocialStanding
{
    /// <summary>Raised when a standing actually changes; a change that hits the cap and leaves it as it was raises nothing.</summary>
    public struct SocialStandingChangedEvent
    {
        public string SubjectId;
        public int PreviousStanding;
        public int NewStanding;

        internal static void Trigger(string subjectId, int previous, int current) =>
            EventBus<SocialStandingChangedEvent>.Raise(new SocialStandingChangedEvent
            {
                SubjectId = subjectId, PreviousStanding = previous, NewStanding = current
            });
    }
}
