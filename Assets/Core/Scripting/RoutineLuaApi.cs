using Core.Routines;
using VContainer;

namespace Core.Scripting
{
    /// <summary>Reads what characters' routines have them doing right now.</summary>
    [LuaModule("Routines")]
    public sealed class RoutineLuaApi
    {
        // The routine service builds its planner from LuaRuntime, which creates this module: resolve it when asked.
        [Inject] private IObjectResolver _resolver;
        private RoutineNpcService Routines => _resolver.Resolve<RoutineNpcService>();

        /// <summary>The occupation the character's routine has them busy with now, such as "fishing"; nil while they walk or have none.</summary>
        [LuaCall, Preserve]
        public string Occupation(string characterId) => Routines.OccupationOf(characterId);

        /// <summary>Whether the character's routine has them busy with this occupation now.</summary>
        [LuaCall, Preserve]
        public bool HasOccupation(string characterId, string occupation) => Routines.OccupationOf(characterId) == occupation;
    }
}
