using System;
using Core.Divinity;
using UnityEngine.Scripting;

namespace Core.Scripting
{
    [LuaModule("DivineFavour")]
    public sealed class DivineFavourLuaApi
    {
        [LuaCall]
        public int GetFavour([LuaResource("deity")] string deityId)
        {
            DeityDefinitions.Get(deityId);
            return DivineFavour.GetFavour(deityId);
        }

        [Preserve]
        public void ValidateAddFavour(string deityId, double points)
        {
            DeityDefinitions.Get(deityId);
            if (!double.IsFinite(points) || points != Math.Truncate(points) || points < int.MinValue || points > int.MaxValue)
                throw new ArgumentOutOfRangeException(nameof(points), "Favour points must be a whole number in the Int32 range.");
        }

        [LuaCall(writesState: true)]
        [LuaAction("divinity.addFavour", "Add divine favour", "Divinity", "Add or subtract saved favour points and update the deity's boons.",
            "cutscene", "npcRoutine", Validator = nameof(ValidateAddFavour), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        public int AddFavour([LuaResource("deity")] string deityId, double points)
        {
            ValidateAddFavour(deityId, points);
            return DivineFavour.AddFavour(deityId, (int)points);
        }
    }
}
