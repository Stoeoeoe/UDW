using VContainer;
using Preserve = UnityEngine.Scripting.PreserveAttribute;
using System;
using Core.Divinity;
using UnityEngine.Scripting;

namespace Core.Scripting
{
    [LuaModule("DivineFavour")]
    public sealed class DivineFavourLuaApi
    {
        [Inject] private DeityDefinitions _deityDefinitions;
        [Inject] private DivineFavour _divineFavour;

        [LuaCall]
        public int GetFavour([LuaResource("deity")] string deityId)
        {
            _deityDefinitions.Get(deityId);
            return _divineFavour.GetFavour(deityId);
        }

        [Preserve]
        public void ValidateAddFavour(string deityId, double points)
        {
            _deityDefinitions.Get(deityId);
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
            return _divineFavour.AddFavour(deityId, (int)points);
        }
    }
}
