using Character;
using VContainer;
using VContainer.Unity;

namespace Core.Common.Editor
{
    /// <summary>
    /// Reads the running game's services from a Play Mode integration test. Isolated EditMode tests use
    /// <see cref="GameTestFixture"/> instead; production code never uses this.
    /// </summary>
    internal static class LiveGame
    {
        public static T Get<T>() => LifetimeScope.Find<SystemRoot>().Container.Resolve<T>();

        public static T Inject<T>(T value) where T : class { LifetimeScope.Find<SystemRoot>().Container.Inject(value); return value; }

        /// <summary>The player registered by the running game.</summary>
        public static MainCharacter Player => Get<CharacterManager>().MainCharacter;
    }
}
